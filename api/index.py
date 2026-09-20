"""
Entry point for Vercel's Python runtime. Vercel looks for an ASGI/WSGI
`app` object in files under /api. This just re-exports the real app.
"""
from app.main import app  # noqa: F401
