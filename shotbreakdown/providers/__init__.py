"""비전 분석 provider 모듈."""
from .base import VisionProvider
from .gemini import GeminiProvider

__all__ = ["VisionProvider", "GeminiProvider", "build_provider"]


def build_provider(name: str, **kwargs) -> VisionProvider:
    """이름으로 provider 인스턴스 생성."""
    name = name.lower()
    if name == "gemini":
        return GeminiProvider(**kwargs)
    if name == "claude":
        raise NotImplementedError(
            "Claude provider는 아직 구현되지 않았습니다. ANTHROPIC_API_KEY가 준비되면 추가됩니다."
        )
    raise ValueError(f"알 수 없는 provider: {name}")
