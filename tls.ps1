using namespace System.Security.Cryptography
using namespace System.Security.Cryptography.X509Certificates

function New-ScreenStudyTls($Directory, $Session, $Addresses) {
    Add-Type -AssemblyName System.Security
    $entropy = [Text.Encoding]::UTF8.GetBytes('ScreenStudy Local CA')
    $scope = [DataProtectionScope]::CurrentUser
    $path = Join-Path $Directory 'ca.dpapi'
    $started = [DateTimeOffset]::UtcNow.AddMinutes(-5)
    $root = $null
    if (Test-Path -LiteralPath $path) {
        $pfx = [ProtectedData]::Unprotect([IO.File]::ReadAllBytes($path), $entropy, $scope)
        $root = [X509Certificate2]::new($pfx, '', [X509KeyStorageFlags]::EphemeralKeySet)
    }
    try {
        if (!$root -or $root.NotAfter.ToUniversalTime() -le $started.UtcDateTime.AddDays(95)) {
            if ($root) { $root.Dispose() }
            $rootKey = [RSACng]::new(2048)
            try {
                $request = [CertificateRequest]::new('CN=ScreenStudy Local CA', $rootKey, [HashAlgorithmName]::SHA256, [RSASignaturePadding]::Pkcs1)
                $request.CertificateExtensions.Add([X509BasicConstraintsExtension]::new($true, $true, 0, $true))
                $request.CertificateExtensions.Add([X509KeyUsageExtension]::new([X509KeyUsageFlags]::KeyCertSign -bor [X509KeyUsageFlags]::CrlSign, $true))
                $request.CertificateExtensions.Add([X509SubjectKeyIdentifierExtension]::new($request.PublicKey, $false))
                $root = $request.CreateSelfSigned($started, $started.AddYears(5))
                $protected = [ProtectedData]::Protect($root.Export([X509ContentType]::Pfx), $entropy, $scope)
                [IO.File]::WriteAllBytes($path, $protected)
            } finally { $rootKey.Dispose() }
        }
        $leafKey = [RSACng]::new(2048)
        try {
            $request = [CertificateRequest]::new('CN=ScreenStudy', $leafKey, [HashAlgorithmName]::SHA256, [RSASignaturePadding]::Pkcs1)
            $names = [SubjectAlternativeNameBuilder]::new()
            foreach ($address in $Addresses) { $names.AddIpAddress([Net.IPAddress]::Parse($address)) }
            $request.CertificateExtensions.Add($names.Build())
            $request.CertificateExtensions.Add([X509BasicConstraintsExtension]::new($false, $false, 0, $true))
            $request.CertificateExtensions.Add([X509KeyUsageExtension]::new([X509KeyUsageFlags]::DigitalSignature -bor [X509KeyUsageFlags]::KeyEncipherment, $true))
            $usages = [OidCollection]::new()
            [void]$usages.Add([Oid]::new('1.3.6.1.5.5.7.3.1'))
            $request.CertificateExtensions.Add([X509EnhancedKeyUsageExtension]::new($usages, $false))
            $serial = New-Object byte[] 16
            $random = [RandomNumberGenerator]::Create()
            try { $random.GetBytes($serial) } finally { $random.Dispose() }
            if ($root.NotBefore.ToUniversalTime() -gt $started.UtcDateTime) {
                $started = [DateTimeOffset]::new($root.NotBefore.ToUniversalTime())
            }
            $leaf = $request.Create($root, $started, $started.AddDays(90), $serial)
            try {
                $parameters = $leafKey.ExportParameters($true)
                $key = @{ kty = 'RSA' }
                $properties = @{ n = 'Modulus'; e = 'Exponent'; d = 'D'; p = 'P'; q = 'Q'; dp = 'DP'; dq = 'DQ'; qi = 'InverseQ' }
                foreach ($name in $properties.Keys) {
                    $bytes = $parameters.($properties[$name])
                    $key[$name] = [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
                }
                $env:STUDY_TLS_CERT = Join-Path $Session 'server.cer'
                $env:STUDY_TLS_KEY = Join-Path $Session 'server-key.json'
                $env:STUDY_TLS_ROOT = Join-Path $Session 'root.cer'
                [IO.File]::WriteAllBytes($env:STUDY_TLS_CERT, $leaf.RawData)
                [IO.File]::WriteAllText($env:STUDY_TLS_KEY, ($key | ConvertTo-Json -Compress))
                [IO.File]::WriteAllBytes($env:STUDY_TLS_ROOT, $root.RawData)
            } finally { $leaf.Dispose() }
        } finally { $leafKey.Dispose() }
    } finally {
        if ($root) { $root.Dispose() }
    }
}
