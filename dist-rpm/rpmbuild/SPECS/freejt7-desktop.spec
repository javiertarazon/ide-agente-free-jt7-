Name: freejt7-desktop
Version: 4.2.11
Release: 1%{?dist}
Summary: Free JT7 Desktop standalone app launcher
License: MIT
URL: https://github.com/javiertarazon/agente-freejt7-extension-funcional
BuildArch: noarch
Requires: nodejs >= 20

%description
Free JT7 Desktop instala y ejecuta un entorno aislado del agente Free JT7
con perfil propio, VSIX propia y runtime VSCodium portable.

%prep
# no-op

%build
# no-op

%install
rm -rf %{buildroot}
mkdir -p %{buildroot}
cp -a %{_sourcedir}/freejt7-root/. %{buildroot}/

%files
%defattr(-,root,root,-)
/opt/freejt7-desktop
/usr/bin/freejt7-desktop
/usr/share/applications/freejt7-desktop.desktop

%post
echo "[freejt7-desktop] Instalado. Ejecuta: freejt7-desktop --no-launch"

%changelog
* Sun Apr 26 2026 Free JT7 Team <noreply@freejt7.local> - 4.2.11-1
- Initial RPM package for Free JT7 Desktop standalone launcher.
