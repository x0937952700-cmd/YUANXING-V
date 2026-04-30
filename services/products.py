import re
from dataclasses import dataclass, asdict
from decimal import Decimal, ROUND_HALF_UP

X_CHARS = str.maketrans({
    '×': 'x', 'Ｘ': 'x', 'X': 'x', '✕': 'x', '＊': 'x', '*': 'x',
    '＝': '=', '＋': '+', '，': '+', ',': '+', '；': '+', ';': '+',
    ' ': '', '\u3000': '',
})

@dataclass
class ProductParseResult:
    raw_text: str
    normalized_text: str
    length: str | None
    width: str | None
    height: str | None
    qty: int
    stick_sum: float
    volume_formula: str
    volume_total: float


def _clean_number_token(token: str) -> str:
    token = token.strip()
    if token.startswith('.'):
        token = '0' + token
    return token


def normalize_symbols(text: str) -> str:
    if text is None:
        return ''
    text = str(text).translate(X_CHARS)
    text = text.replace('\r\n', '\n').replace('\r', '\n')
    text = re.sub(r'\s+', '', text)
    text = re.sub(r'\++', '+', text)
    text = re.sub(r'=+', '=', text)
    return text.strip('+')


def normalize_dimension(length: str, width: str, height: str) -> tuple[str, str, str]:
    length = _clean_number_token(length)
    width = _clean_number_token(width)
    height = _clean_number_token(height)
    # height single digit should be 0-prefixed. .83 / 0.83 => 083.
    if re.fullmatch(r'0?\.\d+', height):
        height = height.split('.', 1)[1]
        if len(height) == 1:
            height = height + '0'
        if len(height) == 2:
            height = '0' + height
    elif re.fullmatch(r'\d', height):
        height = '0' + height
    return length, width, height


def normalize_product_line(line: str, previous_width: str | None = None, previous_height: str | None = None) -> tuple[str, str | None, str | None]:
    line = normalize_symbols(line)
    if not line:
        return '', previous_width, previous_height

    # Handle 179x___=131x4 or 179x_x_=...
    if re.search(r'x_+', line):
        if previous_width and previous_height:
            line = re.sub(r'x_+', f'x{previous_width}x{previous_height}', line, count=1)

    m = re.match(r'^((?:\d+(?:\.\d+)?|\.\d+))x((?:\d+(?:\.\d+)?|\.\d+))x((?:\d+(?:\.\d+)?|\.\d+))(.*)$', line)
    if m:
        l, w, h = normalize_dimension(m.group(1), m.group(2), m.group(3))
        line = f'{l}x{w}x{h}{m.group(4)}'
        return line, w, h
    return line, previous_width, previous_height


def normalize_product_text(text: str) -> str:
    previous_w = None
    previous_h = None
    normalized_lines: list[str] = []
    for raw_line in str(text or '').splitlines():
        line, previous_w, previous_h = normalize_product_line(raw_line, previous_w, previous_h)
        if line:
            normalized_lines.append(line)
    return '\n'.join(normalized_lines)


def _split_rhs(rhs: str) -> list[str]:
    return [p for p in rhs.split('+') if p]


def count_rhs_pieces(rhs: str, has_dimension_left: bool = True) -> int:
    rhs = normalize_symbols(rhs)
    if not rhs:
        return 1
    parts = _split_rhs(rhs)
    if not parts:
        return 1

    # Clean rule after user correction: every right-side A x N segment counts as N pieces,
    # and every standalone segment counts 1.

    total = 0
    for part in parts:
        m = re.fullmatch(r'\d+(?:\.\d+)?x(\d+)', part)
        if m:
            total += int(m.group(1))
        else:
            total += 1
    return max(total, 1)


def stick_sum(rhs: str) -> float:
    rhs = normalize_symbols(rhs)
    if not rhs:
        return 1.0
    total = 0.0
    for part in _split_rhs(rhs):
        m = re.fullmatch(r'(\d+(?:\.\d+)?)x(\d+)', part)
        if m:
            total += float(m.group(1)) * int(m.group(2))
            continue
        n = re.match(r'\d+(?:\.\d+)?', part)
        if n:
            total += float(n.group(0))
    return total if total else 1.0


def length_factor(length: str) -> float:
    n = float(length)
    return n / 1000.0 if n > 210 else n / 100.0


def width_factor(width: str) -> float:
    return float(width) / 10.0


def height_factor(height: str) -> float:
    # Preserve 05 => 0.5, 083 => 0.83, 125 => 1.25, 12 => 1.2
    h = int(re.sub(r'\D', '', height) or '0')
    return h / 100.0 if h >= 100 else h / 10.0


def parse_product_line(line: str) -> ProductParseResult:
    normalized, _, _ = normalize_product_line(line)
    if not normalized:
        return ProductParseResult(line, '', None, None, None, 0, 0.0, '', 0.0)
    m = re.match(r'^((?:\d+(?:\.\d+)?|\.\d+))x((?:\d+(?:\.\d+)?|\.\d+))x(\d+)(?:=(.*))?$', normalized)
    if not m:
        qty = count_rhs_pieces(normalized, has_dimension_left=False)
        return ProductParseResult(line, normalized, None, None, None, qty, stick_sum(normalized), '', 0.0)

    l, w, h = normalize_dimension(m.group(1), m.group(2), m.group(3))
    rhs = m.group(4) or ''
    qty = count_rhs_pieces(rhs, has_dimension_left=True) if rhs else 1
    sticks = stick_sum(rhs) if rhs else 1.0
    lf, wf, hf = length_factor(l), width_factor(w), height_factor(h)
    volume = sticks * lf * wf * hf
    if rhs:
        rhs_display = ' + '.join([re.sub(r'x(\d+)$', r'×\1', p) for p in _split_rhs(rhs)])
        if not rhs_display:
            rhs_display = str(int(sticks))
        formula = f'({rhs_display}) × {lf:g} × {wf:g} × {hf:g}'
    else:
        formula = f'1 × {lf:g} × {wf:g} × {hf:g}'
    return ProductParseResult(line, f'{l}x{w}x{h}' + (f'={rhs}' if rhs else ''), l, w, h, qty, sticks, formula, round(volume, 4))


def parse_product_text(text: str) -> list[dict]:
    norm = normalize_product_text(text)
    return [asdict(parse_product_line(line)) for line in norm.splitlines() if line]


def total_qty_from_text(text: str) -> int:
    items = parse_product_text(text)
    return sum(int(item['qty']) for item in items) if items else 0


def volume_for_items(product_texts: list[str]) -> tuple[list[dict], float, str]:
    rows = []
    total = 0.0
    parts = []
    for text in product_texts:
        for item in parse_product_text(text):
            rows.append(item)
            total += float(item.get('volume_total') or 0)
            if item.get('volume_formula'):
                parts.append(item['volume_formula'])
    formula = ' + '.join(parts)
    return rows, round(total, 4), formula


def is_material_like(value: str) -> bool:
    value = normalize_symbols(value or '')
    return bool(value) and ('x' not in value and '=' not in value)


def _line_prefix_and_rhs(product_text: str) -> tuple[str, str, str]:
    """Return normalized full line, left dimension text, rhs text."""
    normalized = normalize_product_text(product_text).splitlines()[0] if normalize_product_text(product_text).splitlines() else normalize_symbols(product_text)
    if '=' in normalized:
        left, rhs = normalized.split('=', 1)
        return normalized, left, rhs
    return normalized, normalized, ''


def _count_piece(part: str, counted: bool = True) -> int:
    if not counted:
        return 0
    m = re.fullmatch(r'\d+(?:\.\d+)?x(\d+)', part or '')
    return int(m.group(1)) if m else (1 if part else 0)


def deduct_qty_from_product_text(product_text: str, deduct_qty: int) -> dict:
    """Remove a number of counted pieces from the right side of one product line.

    This keeps the user's handwritten expression style as much as possible:
    - 249x3, deduct 1 -> 249x2
    - 60+54+50, deduct 1 -> 60+54
    - 504x5 counts as 5 pieces; standalone segments count 1 each.
    """
    deduct_qty = int(deduct_qty or 0)
    if deduct_qty <= 0:
        raise ValueError('扣除數量必須大於 0')
    normalized, left, rhs = _line_prefix_and_rhs(product_text)
    before_qty = total_qty_from_text(normalized) or 1
    if before_qty < deduct_qty:
        raise ValueError(f'數量不足：目前 {before_qty} 件，要扣 {deduct_qty} 件')
    after_qty = before_qty - deduct_qty
    if after_qty == 0:
        return {
            'before_qty': before_qty,
            'deduct_qty': deduct_qty,
            'after_qty': 0,
            'remaining_text': '',
            'deducted_text': normalized,
        }
    if not rhs and not re.match(r'^((?:\d+(?:\.\d+)?|\.\d+))x((?:\d+(?:\.\d+)?|\.\d+))x(\d+)$', normalized):
        # Pure right-side style input, e.g. 60+54+50 or 220x4+223x2+44.
        parts = _split_rhs(normalized)
        remaining = parts[:]
        deducted_parts = []
        todo = deduct_qty
        for idx in range(len(remaining) - 1, -1, -1):
            if todo <= 0:
                break
            part = remaining[idx]
            cnt = _count_piece(part, counted=True)
            m = re.fullmatch(r'(\d+(?:\.\d+)?)x(\d+)', part)
            if m:
                base = m.group(1); mult = int(m.group(2)); take = min(todo, mult)
                deducted_parts.insert(0, f'{base}x{take}' if take > 1 else base)
                if take == mult:
                    remaining.pop(idx)
                else:
                    remaining[idx] = f'{base}x{mult - take}'
                todo -= take
            elif cnt:
                deducted_parts.insert(0, part); remaining.pop(idx); todo -= 1
        return {
            'before_qty': before_qty,
            'deduct_qty': deduct_qty,
            'after_qty': after_qty,
            'remaining_text': '+'.join(remaining),
            'deducted_text': '+'.join(deducted_parts),
        }
    if not rhs:
        return {
            'before_qty': before_qty,
            'deduct_qty': deduct_qty,
            'after_qty': after_qty,
            'remaining_text': normalized,
            'deducted_text': normalized,
        }
    parts = _split_rhs(rhs)
    long_bundle = False
    remaining = parts[:]
    deducted_parts: list[str] = []
    todo = deduct_qty
    for idx in range(len(remaining) - 1, -1, -1):
        if todo <= 0:
            break
        part = remaining[idx]
        counted = not (long_bundle and idx == 0)
        cnt = _count_piece(part, counted=counted)
        if cnt == 0:
            continue
        m = re.fullmatch(r'(\d+(?:\.\d+)?)x(\d+)', part)
        if m:
            base = m.group(1)
            mult = int(m.group(2))
            take = min(todo, mult)
            deducted_parts.insert(0, f'{base}x{take}' if take > 1 else base)
            if take == mult:
                remaining.pop(idx)
            else:
                remaining[idx] = f'{base}x{mult - take}'
            todo -= take
        else:
            deducted_parts.insert(0, part)
            remaining.pop(idx)
            todo -= 1
    remaining_counted = 0
    for i, p in enumerate(remaining):
        remaining_counted += _count_piece(p, counted=not (long_bundle and i == 0))
    if remaining_counted <= 0:
        remaining_text = ''
    else:
        remaining_text = f'{left}=' + '+'.join(remaining)
    deducted_text = f'{left}=' + '+'.join(deducted_parts) if deducted_parts else normalized
    return {
        'before_qty': before_qty,
        'deduct_qty': deduct_qty,
        'after_qty': after_qty,
        'remaining_text': remaining_text,
        'deducted_text': deducted_text,
    }
