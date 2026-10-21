# Word regression fixtures

These four files come from the installed `mammoth@1.13.0` package's `test/test-data/` directory.
They are test inputs and are not customer documents.
The package license is preserved in [MAMMOTH-LICENSE.txt](MAMMOTH-LICENSE.txt).

The tests verify each complete file's SHA256 before parsing.
They preserve the original ZIP compression flags and XML bytes.

| File | SHA256 |
| --- | --- |
| `single-paragraph.docx` | `7d89bf44b4d6940234efb6973d24706c881aa875bb794bfbe54efd92f9c6cf3e` |
| `simple-list.docx` | `ed3c015cf411d07b08bf34264ff709363740b0747af355479088079d0796dfb3` |
| `utf8-bom.docx` | `8b59e5faa28793693ce0801711525f88b1f94f62d150ae9a92d1e70012d786ee` |
| `empty.docx` | `fd9160a87bcbe94570d998499f1b1ed9b39f381fde1688c2ed2b0b0a6d562bf2` |

These tests do not prove operating-system isolation, authorization, or production readiness.
