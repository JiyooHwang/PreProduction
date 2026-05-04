"""CLI 진입점."""
from __future__ import annotations

import os
from pathlib import Path
from typing import Optional

import typer
from dotenv import load_dotenv
from rich.console import Console
from rich.progress import (
    BarColumn,
    Progress,
    SpinnerColumn,
    TaskProgressColumn,
    TextColumn,
    TimeElapsedColumn,
)

from .export import export_csv, export_excel
from .extract import FFmpegNotFoundError
from .pipeline import build_shot_list
from .providers import build_provider


app = typer.Typer(
    add_completion=False,
    help="애니메이션 샷 브레이크다운 도구 (영상 → 샷 리스트 Excel)",
)
console = Console()


@app.command()
def breakdown(
    video: Path = typer.Argument(
        ..., exists=True, dir_okay=False, readable=True, help="입력 영상 파일 (mp4, mov 등)"
    ),
    output: Path = typer.Option(
        Path("output"), "--output", "-o", help="출력 디렉토리"
    ),
    threshold: float = typer.Option(
        27.0, "--threshold", "-t", help="컷 감지 민감도 (낮을수록 컷 더 많이 감지)"
    ),
    skip_analysis: bool = typer.Option(
        False, "--skip-analysis", help="AI 분석을 생략 (컷 감지 + 썸네일만 출력)"
    ),
    provider: str = typer.Option(
        None, "--provider", "-p", help="비전 provider (gemini). 기본: VISION_PROVIDER 환경변수"
    ),
    csv: bool = typer.Option(False, "--csv", help="Excel과 함께 CSV도 출력"),
):
    """영상을 컷 단위로 분해해 Excel 샷 리스트로 출력."""
    load_dotenv()

    output.mkdir(parents=True, exist_ok=True)

    vision = None
    if not skip_analysis:
        provider_name = provider or os.environ.get("VISION_PROVIDER", "gemini")
        try:
            vision = build_provider(provider_name)
        except Exception as e:
            console.print(f"[red]Provider 초기화 실패:[/] {e}")
            console.print("[yellow]→ 분석 없이 컷 감지만 진행합니다. (--skip-analysis 와 동일)[/]")
            vision = None

    try:
        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            BarColumn(),
            TaskProgressColumn(),
            TimeElapsedColumn(),
            console=console,
            transient=False,
        ) as progress:
            task_id: Optional[int] = None

            def on_progress(done: int, total: int, msg: str) -> None:
                nonlocal task_id
                if task_id is None:
                    task_id = progress.add_task(msg, total=total)
                else:
                    progress.update(task_id, total=total, completed=done, description=msg)

            shots = build_shot_list(
                video_path=video,
                output_dir=output,
                threshold=threshold,
                vision=vision,
                on_progress=on_progress,
            )
    except FFmpegNotFoundError as e:
        console.print(f"[red]{e}[/]")
        raise typer.Exit(2)

    if not shots:
        console.print("[yellow]감지된 컷이 없습니다. --threshold 값을 낮춰 다시 시도해 보세요.[/]")
        raise typer.Exit(1)

    excel_path = output / f"{video.stem}_shotlist.xlsx"
    export_excel(shots, excel_path)
    console.print(f"[bold green]✓[/] Excel: {excel_path}")

    if csv:
        csv_path = output / f"{video.stem}_shotlist.csv"
        export_csv(shots, csv_path)
        console.print(f"[bold green]✓[/] CSV:   {csv_path}")

    console.print(f"[dim]총 {len(shots)}컷, 썸네일은 {output / 'frames'} 에 저장되었습니다.[/]")


def main() -> None:
    app()


if __name__ == "__main__":
    main()
