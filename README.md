# lasso-php

`lasso-php` is the Service Lasso service repo for a release-backed **PHP runtime provider**. It packages PHP `8.3.32` and exports the binaries and paths that PHP applications need.

It is a provider, not a web server:

- POSIX (Linux/macOS): ships `php` (CLI) and `php-fpm` (FastCGI).
- Windows: ships `php.exe`, `php-cgi.exe`, and the bundled extensions.

Caddy remains the FastCGI translator (`domain → php-fpm`/`php-cgi`) and Traefik remains the public edge (TLS + `Host`).

## Service contract

- Service id: `php` (app-owned, unprefixed)
- Role: `provider`
- Provides: `{ "php": "8.3.32" }`
- Release assets:
  - `lasso-php-8.3.32-win32.zip`
  - `lasso-php-8.3.32-linux.tar.gz`
  - `lasso-php-8.3.32-darwin.tar.gz`
  - `service.json`
  - `SHA256SUMS.txt`

### Exported environment (`globalenv`)

| Variable | Meaning |
| --- | --- |
| `PHP` | The CLI command (`SERVICE_ARTIFACT_COMMAND`, e.g. `./php` or `.\php.exe`). |
| `PHP_HOME` | Extracted artifact root. |
| `PHP_VERSION` | `8.3.32`. |
| `PHP_FPM` | `${PHP_HOME}/php-fpm` (POSIX). |
| `PHP_CGI` | `${PHP_HOME}/php-cgi.exe` (Windows). |
| `PHP_EXTENSION_DIR` | `${PHP_HOME}/ext` (Windows bundled extensions). |

## Using it from a PHP app

An app depends on `php`, runs its own FastCGI server with its own document root, and asks Caddy to publish it:

```json
"depend_on": ["php"],
"requires": { "php": ">=8.3" },
"endpoints": [
  {
    "id": "fastcgi",
    "kind": "network",
    "direction": "inbound",
    "transport": "tcp",
    "protocol": "tcp",
    "bind": "127.0.0.1",
    "port": { "default": 9000, "strategy": "preferred" },
    "exposure": "local",
    "required": true,
    "primary": true
  }
],
"commandline": {
  "win32": " -b 127.0.0.1:${endpoint.fastcgi.port}",
  "linux": " --nodaemonize --fpm-config runtime/php-fpm.conf",
  "darwin": " --nodaemonize --fpm-config runtime/php-fpm.conf"
},
"ingress": [
  {
    "domain": "app.servicelasso.localhost",
    "proxy": { "type": "fastcgi", "endpoint": "fastcgi", "root": "${SERVICE_ROOT}/runtime/www" }
  }
]
```

The app's `executable` is `${PHP_CGI}` on Windows and `${PHP_FPM}` on POSIX (resolved from the provider's `globalenv`).

## Local verification

```powershell
npm test
```

This downloads the pinned upstream, packages the current platform, extracts the archive, and runs `php -v`, plus `php-fpm -v` (POSIX) or `php-cgi -v` (Windows).

## Packaging

```powershell
npm run package
```

Override the target platform or PHP version:

```powershell
$env:TARGET_PLATFORM = "linux"; $env:PHP_VERSION = "8.3.32"; npm run package
```

Windows packages come from `windows.php.net`; Linux/macOS packages come from `static-php.dev` (static `php` + `php-fpm`).
