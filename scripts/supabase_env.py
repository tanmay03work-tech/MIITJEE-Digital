import os
from pathlib import Path


def _read_env_file(file_path: Path) -> dict[str, str]:
    if not file_path.exists():
        return {}

    values: dict[str, str] = {}
    for line in file_path.read_text(encoding='utf-8').splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith('#') or '=' not in stripped:
            continue
        key, value = stripped.split('=', 1)
        values[key.strip()] = value.strip().strip('"\'')
    return values


_ROOT = Path(__file__).resolve().parent.parent
_PRIVATE_VALUES = {
    **_read_env_file(_ROOT / '.env'),
    **_read_env_file(_ROOT / 'miitjee-backend' / '.dev.vars'),
}


def _required(name: str) -> str:
    value = os.environ.get(name) or _PRIVATE_VALUES.get(name)
    if not value:
        raise RuntimeError(f'Missing {name}. Set it in the environment or miitjee-backend/.dev.vars.')
    return value


SUPABASE_URL = os.environ.get('SUPABASE_URL') or _PRIVATE_VALUES.get(
    'SUPABASE_URL', 'https://uwuzdggimbbbfgcauzho.supabase.co'
)
SERVICE_ROLE_KEY = _required('SUPABASE_SERVICE_KEY')
