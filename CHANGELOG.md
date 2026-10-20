# Changelog

## 0.1.0
- initialize `lasso-php` as a release-backed PHP runtime provider for Service Lasso
- package PHP `8.3.32`: Windows `php.exe` + `php-cgi.exe`, POSIX `php` + `php-fpm`
- declare the `php` provider capability and export `PHP`, `PHP_HOME`, `PHP_VERSION`, `PHP_FPM`, `PHP_CGI`, and `PHP_EXTENSION_DIR`
- add local package/verify scripts and the multi-OS release workflow
