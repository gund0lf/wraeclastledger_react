#define UNICODE
#define _UNICODE
#define _WIN32_WINNT 0x0600

#include <fcntl.h>
#include <io.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <wchar.h>
#include <windows.h>

static HWND bridge_window = NULL;

static void emit_clipboard_text(HWND hwnd) {
  BOOL opened = FALSE;
  for (int attempt = 0; attempt < 20; attempt++) {
    if (OpenClipboard(hwnd)) {
      opened = TRUE;
      break;
    }
    Sleep(10);
  }
  if (!opened) return;

  HANDLE value = GetClipboardData(CF_UNICODETEXT);
  if (value == NULL) {
    CloseClipboard();
    return;
  }
  const wchar_t *wide = (const wchar_t *)GlobalLock(value);
  if (wide == NULL) {
    CloseClipboard();
    return;
  }

  int wide_length = (int)wcslen(wide);
  int utf8_length = WideCharToMultiByte(
    CP_UTF8, WC_ERR_INVALID_CHARS, wide, wide_length, NULL, 0, NULL, NULL
  );
  if (utf8_length > 0) {
    char *utf8 = (char *)malloc((size_t)utf8_length);
    if (utf8 != NULL && WideCharToMultiByte(
      CP_UTF8, WC_ERR_INVALID_CHARS, wide, wide_length, utf8, utf8_length, NULL, NULL
    ) == utf8_length) {
      printf("WLCLIP/1 TEXT %d\n", utf8_length);
      fwrite(utf8, 1, (size_t)utf8_length, stdout);
      fputc('\n', stdout);
      fflush(stdout);
    }
    free(utf8);
  }
  GlobalUnlock(value);
  CloseClipboard();
}

static LRESULT CALLBACK bridge_window_proc(HWND hwnd, UINT message, WPARAM wparam, LPARAM lparam) {
  (void)wparam;
  (void)lparam;
  if (message == WM_CLIPBOARDUPDATE) {
    emit_clipboard_text(hwnd);
    return 0;
  }
  if (message == WM_CLOSE) {
    DestroyWindow(hwnd);
    return 0;
  }
  if (message == WM_DESTROY) {
    PostQuitMessage(0);
    return 0;
  }
  return DefWindowProc(hwnd, message, wparam, lparam);
}

static DWORD WINAPI watch_parent_pipe(LPVOID unused) {
  (void)unused;
  char byte;
  while (fread(&byte, 1, 1, stdin) == 1) {}
  if (bridge_window != NULL) PostMessage(bridge_window, WM_CLOSE, 0, 0);
  return 0;
}

int main(void) {
  _setmode(_fileno(stdout), _O_BINARY);
  SetErrorMode(SEM_FAILCRITICALERRORS | SEM_NOGPFAULTERRORBOX);

  HINSTANCE instance = GetModuleHandle(NULL);
  const wchar_t class_name[] = L"WraeclastLedgerClipboardBridge";
  WNDCLASS window_class = {0};
  window_class.lpfnWndProc = bridge_window_proc;
  window_class.hInstance = instance;
  window_class.lpszClassName = class_name;
  if (!RegisterClass(&window_class) && GetLastError() != ERROR_CLASS_ALREADY_EXISTS) return 2;

  bridge_window = CreateWindowEx(
    0, class_name, L"WraeclastLedger Clipboard Bridge", 0,
    0, 0, 0, 0, HWND_MESSAGE, NULL, instance, NULL
  );
  if (bridge_window == NULL) return 3;
  if (!AddClipboardFormatListener(bridge_window)) return 4;

  HANDLE pipe_thread = CreateThread(NULL, 0, watch_parent_pipe, NULL, 0, NULL);
  printf("WLCLIP/1 READY\n");
  fflush(stdout);

  MSG message;
  while (GetMessage(&message, NULL, 0, 0) > 0) {
    TranslateMessage(&message);
    DispatchMessage(&message);
  }

  RemoveClipboardFormatListener(bridge_window);
  if (pipe_thread != NULL) CloseHandle(pipe_thread);
  return 0;
}
