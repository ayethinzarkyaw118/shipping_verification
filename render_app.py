from pathlib import Path

from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.main import app


DIST_DIR = Path(__file__).resolve().parent / "frontend" / "dist"

if DIST_DIR.exists():
    app.mount(
        "/frontend",
        StaticFiles(directory=DIST_DIR),
        name="frontend",
    )

    @app.get("/", include_in_schema=False)
    def frontend_root():
        return FileResponse(DIST_DIR / "index.html")
