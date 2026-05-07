param(
    [int]$Port = 8000
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootFull = [System.IO.Path]::GetFullPath($Root)
$Prefix = "http://localhost:$Port/"

$MimeTypes = @{
    '.html' = 'text/html; charset=utf-8'
    '.css'  = 'text/css; charset=utf-8'
    '.js'   = 'application/javascript; charset=utf-8'
    '.json' = 'application/json; charset=utf-8'
    '.png'  = 'image/png'
    '.jpg'  = 'image/jpeg'
    '.jpeg' = 'image/jpeg'
    '.gif'  = 'image/gif'
    '.svg'  = 'image/svg+xml'
    '.ico'  = 'image/x-icon'
}

function Send-HttpResponse {
    param(
        [System.Net.Sockets.NetworkStream]$Stream,
        [int]$StatusCode,
        [string]$StatusText,
        [string]$ContentType = 'text/plain; charset=utf-8',
        [byte[]]$Body = [byte[]]::new(0),
        [bool]$HeadOnly = $false
    )

    $Header = "HTTP/1.1 $StatusCode $StatusText`r`nContent-Type: $ContentType`r`nContent-Length: $($Body.Length)`r`nConnection: close`r`n`r`n"
    $HeaderBytes = [System.Text.Encoding]::ASCII.GetBytes($Header)
    $Stream.Write($HeaderBytes, 0, $HeaderBytes.Length)

    if (-not $HeadOnly -and $Body.Length -gt 0) {
        $Stream.Write($Body, 0, $Body.Length)
    }
}

$Address = [System.Net.IPAddress]::Parse('127.0.0.1')
$Server = [System.Net.Sockets.TcpListener]::new($Address, $Port)
$Server.Start()

Write-Host "Serving $RootFull at $Prefix"
Write-Host 'Press Ctrl+C to stop.'

try {
    while ($true) {
        $Client = $Server.AcceptTcpClient()

        try {
            $Stream = $Client.GetStream()
            $Buffer = [byte[]]::new(8192)
            $Read = $Stream.Read($Buffer, 0, $Buffer.Length)

            if ($Read -le 0) {
                continue
            }

            $RequestText = [System.Text.Encoding]::ASCII.GetString($Buffer, 0, $Read)
            $FirstLine = ([regex]::Split($RequestText, '\r?\n') | Select-Object -First 1)

            if ($FirstLine -notmatch '^(GET|HEAD)\s+(\S+)\s+HTTP/') {
                $Body = [System.Text.Encoding]::UTF8.GetBytes('Bad request')
                Send-HttpResponse -Stream $Stream -StatusCode 400 -StatusText 'Bad Request' -Body $Body
                continue
            }

            $Method = $Matches[1]
            $Target = ($Matches[2] -split '\?')[0]
            $HeadOnly = $Method -eq 'HEAD'
            $RequestPath = [System.Uri]::UnescapeDataString($Target.TrimStart('/'))

            if ([string]::IsNullOrWhiteSpace($RequestPath)) {
                $RequestPath = 'index.html'
            }

            $RequestPath = $RequestPath.Replace('/', [System.IO.Path]::DirectorySeparatorChar)
            $FilePath = [System.IO.Path]::GetFullPath((Join-Path $RootFull $RequestPath))

            if (-not $FilePath.StartsWith($RootFull, [System.StringComparison]::OrdinalIgnoreCase)) {
                $Body = [System.Text.Encoding]::UTF8.GetBytes('Forbidden')
                Send-HttpResponse -Stream $Stream -StatusCode 403 -StatusText 'Forbidden' -Body $Body -HeadOnly $HeadOnly
                continue
            }

            if ([System.IO.Directory]::Exists($FilePath)) {
                $FilePath = Join-Path $FilePath 'index.html'
            }

            if (-not [System.IO.File]::Exists($FilePath)) {
                $Body = [System.Text.Encoding]::UTF8.GetBytes('Not found')
                Send-HttpResponse -Stream $Stream -StatusCode 404 -StatusText 'Not Found' -Body $Body -HeadOnly $HeadOnly
                continue
            }

            $Ext = [System.IO.Path]::GetExtension($FilePath).ToLowerInvariant()
            $ContentType = $MimeTypes[$Ext]
            if (-not $ContentType) {
                $ContentType = 'application/octet-stream'
            }

            $Bytes = [System.IO.File]::ReadAllBytes($FilePath)
            Send-HttpResponse -Stream $Stream -StatusCode 200 -StatusText 'OK' -ContentType $ContentType -Body $Bytes -HeadOnly $HeadOnly
        }
        finally {
            $Client.Close()
        }
    }
}
finally {
    $Server.Stop()
}
