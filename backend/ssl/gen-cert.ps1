$cert = New-SelfSignedCertificate -DnsName "192.168.1.3" -CertStoreLocation Cert:\CurrentUser\My
Export-PfxCertificate -Cert $cert -FilePath "e:\Lucky-pool\backend\ssl\devcert.pfx" -Password (ConvertTo-SecureString -String "123456" -Force -AsPlainText) -Force
Export-Certificate -Cert $cert -FilePath "e:\Lucky-pool\backend\ssl\cert.cer" -Force
