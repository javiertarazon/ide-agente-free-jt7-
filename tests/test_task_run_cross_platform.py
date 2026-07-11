"""
Pruebas de regresión para task-run cross-platform (Free JT7).

Cubre las 4 funciones corregidas en skills_manager.py:
  - _platform_family
  - _normalize_shell_command
  - _execute_task_shell
  - _task_step_attempts

Relacionado con el bug fix verificado en la run 20260416T002223Z-5d848cba:
"_normalize_shell_command convertía comandos POSIX a PowerShell en todas las
plataformas; _execute_task_shell siempre invocaba powershell en Linux."
"""

import os
import sys
import shutil
from unittest.mock import patch, MagicMock

import pytest

# Ajustar path para importar skills_manager desde la raíz del proyecto
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from skills_manager import (
    _platform_family,
    _normalize_shell_command,
    _execute_task_shell,
    _task_step_attempts,
)


# ──────────────────────────────────────────────────────────────────────────────
# TestPlatformFamily
# ──────────────────────────────────────────────────────────────────────────────

class TestPlatformFamily:
    """_platform_family debe identificar el SO correctamente."""

    def test_linux(self):
        with patch("platform.system", return_value="Linux"):
            assert _platform_family() == "linux"

    def test_linux_lowercase(self):
        with patch("platform.system", return_value="linux"):
            assert _platform_family() == "linux"

    def test_windows(self):
        with patch("platform.system", return_value="Windows"):
            assert _platform_family() == "windows"

    def test_windows_nt(self):
        with patch("platform.system", return_value="windows_nt"):
            assert _platform_family() == "windows"

    def test_darwin(self):
        with patch("platform.system", return_value="Darwin"):
            assert _platform_family() == "darwin"

    def test_unknown_defaults_to_linux(self):
        with patch("platform.system", return_value="FreeBSD"):
            assert _platform_family() == "linux"

    def test_empty_string_defaults_to_linux(self):
        with patch("platform.system", return_value=""):
            assert _platform_family() == "linux"


# ──────────────────────────────────────────────────────────────────────────────
# TestNormalizeShellCommand
# ──────────────────────────────────────────────────────────────────────────────

class TestNormalizeShellCommand:
    """
    REGRESIÓN CRÍTICA: en Linux/Darwin los comandos POSIX NO deben traducirse.
    En Windows (cross-shell) se traducen a equivalentes PowerShell.
    """

    # ── Estrategia != cross-shell: siempre retorna el comando original ──

    def test_non_cross_shell_strategy_linux(self):
        assert _normalize_shell_command("ls", "direct", "linux") == "ls"

    def test_non_cross_shell_strategy_windows(self):
        assert _normalize_shell_command("ls", "powershell", "windows") == "ls"

    def test_non_cross_shell_strategy_darwin(self):
        assert _normalize_shell_command("pwd", "bash", "darwin") == "pwd"

    # ── Linux: cross-shell → sin traducción (bug original) ──

    def test_linux_ls_not_translated(self):
        """REGRESIÓN: 'ls' en Linux NO debe convertirse a Get-ChildItem."""
        result = _normalize_shell_command("ls", "cross-shell", "linux")
        assert result == "ls"
        assert "Get-ChildItem" not in result

    def test_linux_cat_not_translated(self):
        result = _normalize_shell_command("cat /etc/hosts", "cross-shell", "linux")
        assert result == "cat /etc/hosts"
        assert "Get-Content" not in result

    def test_linux_pwd_not_translated(self):
        result = _normalize_shell_command("pwd", "cross-shell", "linux")
        assert result == "pwd"
        assert "Get-Location" not in result

    def test_linux_grep_not_translated(self):
        result = _normalize_shell_command("grep foo bar.txt", "cross-shell", "linux")
        assert result == "grep foo bar.txt"
        assert "Select-String" not in result

    def test_linux_arbitrary_command_passthrough(self):
        cmd = "echo hello world"
        assert _normalize_shell_command(cmd, "cross-shell", "linux") == cmd

    # ── Darwin: cross-shell → sin traducción ──

    def test_darwin_ls_not_translated(self):
        result = _normalize_shell_command("ls", "cross-shell", "darwin")
        assert result == "ls"
        assert "Get-ChildItem" not in result

    def test_darwin_cat_not_translated(self):
        result = _normalize_shell_command("cat /tmp/test", "cross-shell", "darwin")
        assert result == "cat /tmp/test"

    def test_darwin_pwd_not_translated(self):
        result = _normalize_shell_command("pwd", "cross-shell", "darwin")
        assert result == "pwd"

    # ── Windows: cross-shell → traducción PowerShell ──

    def test_windows_ls_to_get_child_item(self):
        result = _normalize_shell_command("ls", "cross-shell", "windows")
        assert result == "Get-ChildItem"

    def test_windows_cat_to_get_content(self):
        result = _normalize_shell_command("cat myfile.txt", "cross-shell", "windows")
        assert result == "Get-Content -Path myfile.txt"

    def test_windows_pwd_to_get_location(self):
        result = _normalize_shell_command("pwd", "cross-shell", "windows")
        assert result == "Get-Location"

    def test_windows_grep_to_select_string(self):
        result = _normalize_shell_command("grep pattern file.txt", "cross-shell", "windows")
        assert result == "Select-String -Path file.txt -Pattern pattern"

    def test_windows_unknown_command_passthrough(self):
        cmd = "some-other-command --flag"
        result = _normalize_shell_command(cmd, "cross-shell", "windows")
        assert result == cmd

    # ── platform_family inferido automáticamente ──

    def test_auto_detect_platform(self):
        """Sin platform_family explícito, debe detectarse automáticamente."""
        with patch("platform.system", return_value="Linux"):
            result = _normalize_shell_command("ls", "cross-shell")
            assert result == "ls"

    def test_auto_detect_windows(self):
        with patch("platform.system", return_value="Windows"):
            result = _normalize_shell_command("ls", "cross-shell")
            assert result == "Get-ChildItem"


# ──────────────────────────────────────────────────────────────────────────────
# TestTaskStepAttempts
# ──────────────────────────────────────────────────────────────────────────────

class TestTaskStepAttempts:
    """_task_step_attempts devuelve la lista de intentos según plataforma."""

    def test_linux_contains_posix_redirect(self):
        attempts = _task_step_attempts("ls", "ls", "linux")
        assert any("2>/dev/null" in a for a in attempts)

    def test_linux_does_not_contain_powershell_redirect(self):
        attempts = _task_step_attempts("ls", "ls", "linux")
        assert not any("2>$null" in a for a in attempts)

    def test_linux_does_not_contain_cmd_prefix(self):
        attempts = _task_step_attempts("ls", "ls", "linux")
        assert not any(a.startswith("cmd /c") for a in attempts)

    def test_darwin_contains_posix_redirect(self):
        attempts = _task_step_attempts("ls", "ls", "darwin")
        assert any("2>/dev/null" in a for a in attempts)

    def test_darwin_no_powershell(self):
        attempts = _task_step_attempts("ls", "ls", "darwin")
        assert not any("2>$null" in a for a in attempts)

    def test_windows_contains_ps_redirect(self):
        attempts = _task_step_attempts("ls", "Get-ChildItem", "windows")
        assert any("2>$null" in a for a in attempts)

    def test_windows_contains_cmd_fallback(self):
        attempts = _task_step_attempts("ls", "Get-ChildItem", "windows")
        assert any("cmd /c" in a for a in attempts)

    def test_no_duplicates(self):
        """La lista no debe tener candidatos duplicados."""
        attempts = _task_step_attempts("ls", "ls", "linux")
        assert len(attempts) == len(set(attempts))

    def test_no_empty_strings(self):
        attempts = _task_step_attempts("ls", "ls", "linux")
        assert all(a.strip() for a in attempts)

    def test_normalized_is_first(self):
        """El comando normalizado debe ser el primer intento."""
        attempts = _task_step_attempts("ls", "Get-ChildItem", "windows")
        assert attempts[0] == "Get-ChildItem"

    def test_blank_normalized_filtered(self):
        """Un normalized vacío no debe introducir entradas vacías."""
        attempts = _task_step_attempts("ls", "   ", "linux")
        assert all(a.strip() for a in attempts)

    def test_auto_detect_platform(self):
        with patch("platform.system", return_value="Linux"):
            attempts = _task_step_attempts("ls", "ls")
            assert any("2>/dev/null" in a for a in attempts)


# ──────────────────────────────────────────────────────────────────────────────
# TestExecuteTaskShell
# ──────────────────────────────────────────────────────────────────────────────

class TestExecuteTaskShell:
    """
    _execute_task_shell:
      - Linux/Darwin → usa bash/sh (nunca powershell)
      - Windows → usa _execute_powershell
    """

    def test_linux_echo_success(self):
        rc, output = _execute_task_shell("echo hello", platform_family="linux")
        assert rc == 0
        assert "hello" in output

    def test_darwin_echo_success(self):
        """Darwin también usa POSIX shell."""
        if shutil.which("bash") is None and shutil.which("sh") is None:
            pytest.skip("No POSIX shell disponible en este entorno")
        rc, output = _execute_task_shell("echo darwin_test", platform_family="darwin")
        assert rc == 0
        assert "darwin_test" in output

    def test_linux_nonzero_exit(self):
        rc, output = _execute_task_shell("exit 42", platform_family="linux")
        assert rc == 42

    def test_linux_no_shell_fallback(self):
        """Sin bash ni sh, debe retornar error controlado."""
        with patch("shutil.which", return_value=None):
            rc, output = _execute_task_shell("ls", platform_family="linux")
            assert rc != 0
            assert "shell" in output.lower() or rc == 1

    def test_windows_delegates_to_powershell(self):
        """En Windows, _execute_task_shell llama a _execute_powershell."""
        with patch(
            "skills_manager._execute_powershell", return_value=(0, "ps_output")
        ) as mock_ps:
            rc, output = _execute_task_shell("Get-ChildItem", platform_family="windows")
            mock_ps.assert_called_once()
            assert rc == 0
            assert output == "ps_output"

    def test_linux_does_not_call_powershell(self):
        """En Linux, _execute_powershell nunca debe invocarse."""
        with patch("skills_manager._execute_powershell") as mock_ps:
            _execute_task_shell("echo test", platform_family="linux")
            mock_ps.assert_not_called()

    def test_darwin_does_not_call_powershell(self):
        """En Darwin, _execute_powershell nunca debe invocarse."""
        with patch("skills_manager._execute_powershell") as mock_ps:
            _execute_task_shell("echo test", platform_family="darwin")
            mock_ps.assert_not_called()

    def test_output_truncated_at_8000(self):
        """La salida no debe superar 8000 caracteres."""
        big_output = "x" * 10000
        with patch("subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(
                returncode=0, stdout=big_output, stderr=""
            )
            rc, output = _execute_task_shell("echo big", platform_family="linux")
            assert len(output) <= 8000

    def test_timeout_returns_124(self):
        """Timeout debe retornar código 124."""
        import subprocess
        with patch("subprocess.run", side_effect=subprocess.TimeoutExpired("cmd", 1)):
            rc, output = _execute_task_shell("sleep 9999", platform_family="linux")
            assert rc == 124
            assert "timed out" in output

    def test_auto_detect_platform_linux(self):
        """Sin platform_family explícito, en Linux usa POSIX shell."""
        with patch("platform.system", return_value="Linux"):
            with patch("skills_manager._execute_powershell") as mock_ps:
                _execute_task_shell("echo auto")
                mock_ps.assert_not_called()
