"""FastAPI 진입점."""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .database import init_db
from .jobs import start_workers
from .scenario_jobs import start_scenario_workers
from .routers import characters, projects, scenarios, shots, users


logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    settings.storage_dir.mkdir(parents=True, exist_ok=True)
    settings.upload_dir.mkdir(parents=True, exist_ok=True)
    start_workers()
    start_scenario_workers()
    yield


app = FastAPI(title="Shot Breakdown API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(users.router)
app.include_router(characters.router)
app.include_router(projects.router)
app.include_router(scenarios.router)
app.include_router(shots.router)


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}
