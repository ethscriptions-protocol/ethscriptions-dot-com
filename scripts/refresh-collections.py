#!/usr/bin/env python3
"""
Refresh data/collections.json + image files in public/collection-images/.

What this populates:
  - For every entry with an `address`, calls `contractURI()` on
    https://mainnet.ethscriptions.com via eth_call, decodes the returned
    data: URI, parses the JSON, and writes the inline `image` to disk at
    public/collection-images/<address>.<ext>. Records the relative path in the
    `image` field of the JSON.
  - Skips entries that have no address.

How the address/supply/holders data got in the JSON originally:
  1. Source list of 62 names came from the old /collections page HTML.
  2. ERC-721 addresses: queried `https://explorer.ethscriptions.com/api/v2/tokens
     ?type=ERC-721&q=<name>` for each name. Falls back to fuzzy by-normalized-name
     match against the paginated full list (BlockScout's paginated list silently
     drops entries; the `?q=` endpoint is reliable).
  3. ERC-404 addresses (the six `erc-20 ... token` entries): queried
     `https://explorer.ethscriptions.com/api/v2/tokens?type=ERC-404` and matched
     by symbol/name to the middle word ("eths" → ETHS, etc.).
  4. ERC-404 supplies were divided by 1e18 (BlockScout returns wei; the contract
     has 18 decimals) so the table shows "21,000,000" instead of a 25-digit number.

Run:
  python3 scripts/refresh-collections.py
"""

import base64
import json
import os
import re
import sys
import time
import urllib.request

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
JSON_PATH = os.path.join(REPO, "data/collections.json")
IMG_DIR = os.path.join(REPO, "public/collection-images")


def load_dotenv(path: str) -> dict[str, str]:
    out: dict[str, str] = {}
    if not os.path.exists(path):
        return out
    with open(path) as f:
        for line in f:
            stripped = line.strip()
            if not stripped or stripped.startswith("#") or "=" not in stripped:
                continue
            key, _, value = stripped.partition("=")
            value = value.strip().strip('"').strip("'")
            out[key.strip()] = value
    return out


_env = load_dotenv(os.path.join(REPO, ".env"))
EXPLORER_BASE = os.getenv("NEXT_PUBLIC_EXPLORER_BASE_URI", _env.get("NEXT_PUBLIC_EXPLORER_BASE_URI", "")).rstrip("/")
RPC_URL = os.getenv("ETHSCRIPTIONS_MAINNET_RPC_URL", _env.get("ETHSCRIPTIONS_MAINNET_RPC_URL", "https://mainnet.ethscriptions.com"))
BLOCKSCOUT_TOKEN = f"{EXPLORER_BASE}/api/v2/tokens"
CONTRACT_URI_SELECTOR = "0xe8a3d485"  # keccak256("contractURI()")[:4]

EXT_BY_MIMETYPE = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/gif": "gif",
    "image/svg+xml": "svg",
    "image/webp": "webp",
}


def fetch_blockscout_token(addr: str) -> dict | None:
    req = urllib.request.Request(f"{BLOCKSCOUT_TOKEN}/{addr}",
                                 headers={"user-agent": "ethscriptions-refresh"})
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return json.loads(r.read())
    except Exception as e:
        print(f"  blockscout fetch failed for {addr}: {e}")
        return None


def eth_call(to: str, data: str) -> str:
    body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": "eth_call",
                       "params": [{"to": to, "data": data}, "latest"]}).encode()
    req = urllib.request.Request(RPC_URL, data=body,
                                 headers={"content-type": "application/json",
                                          "user-agent": "ethscriptions-refresh"})
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read())["result"]


def decode_abi_string(hex_result: str) -> str:
    raw = bytes.fromhex(hex_result.removeprefix("0x"))
    # [0:32] = offset, [32:64] = length, then bytes
    length = int.from_bytes(raw[32:64], "big")
    return raw[64:64 + length].decode("utf-8")


def parse_data_uri(uri: str) -> tuple[str, bytes]:
    """Return (mimetype, raw_bytes) from a data: URI."""
    m = re.match(r"data:([^;,]+)(;base64)?,(.*)$", uri, re.S)
    if not m:
        raise ValueError(f"not a data URI: {uri[:80]!r}")
    mimetype = m.group(1)
    is_b64 = bool(m.group(2))
    payload = m.group(3)
    body = base64.b64decode(payload) if is_b64 else urllib.parse.unquote_to_bytes(payload)
    return mimetype, body


def main() -> int:
    with open(JSON_PATH) as f:
        coll = json.load(f)

    os.makedirs(IMG_DIR, exist_ok=True)
    updated = 0
    failed: list[tuple[str, str]] = []

    for c in coll:
        addr = c.get("address")
        if not addr:
            continue

        # Backfill supply/holders from BlockScout for any entry missing them.
        if not c.get("supply") or not c.get("holders"):
            bs = fetch_blockscout_token(addr)
            if bs:
                supply = bs.get("total_supply")
                if supply and c.get("type") == "ERC-404":
                    # BlockScout returns wei for ERC-404 (18 decimals).
                    supply = str(int(supply) // 10**18)
                if supply and not c.get("supply"):
                    c["supply"] = supply
                if bs.get("holders_count") and not c.get("holders"):
                    c["holders"] = bs["holders_count"]
            time.sleep(0.1)

        if c.get("type") == "ERC-404":
            # ERC-404 contracts don't implement contractURI(); skip image fetch.
            continue
        try:
            hex_result = eth_call(addr, CONTRACT_URI_SELECTOR)
            uri = decode_abi_string(hex_result)
            mt, body = parse_data_uri(uri)
            if mt != "application/json":
                raise ValueError(f"contractURI returned {mt}, expected JSON")
            meta = json.loads(body)
            img_uri = meta.get("image")
            if not img_uri:
                raise ValueError("no 'image' field")
            img_mt, img_bytes = parse_data_uri(img_uri)
            ext = EXT_BY_MIMETYPE.get(img_mt)
            if not ext:
                raise ValueError(f"unsupported image mimetype: {img_mt}")
            path = os.path.join(IMG_DIR, f"{addr.lower()}.{ext}")
            with open(path, "wb") as f:
                f.write(img_bytes)
            c["image"] = f"/collection-images/{addr.lower()}.{ext}"
            updated += 1
            print(f"  {c['name']:35s} → {path} ({len(img_bytes)} bytes)")
        except Exception as e:
            failed.append((c["name"], str(e)))
            print(f"  {c['name']:35s} FAILED: {e}")
        time.sleep(0.1)

    with open(JSON_PATH, "w") as f:
        json.dump(coll, f, indent=2)

    print(f"\nUpdated {updated} entries; {len(failed)} failures")
    for name, err in failed:
        print(f"  {name}: {err}")
    return 0 if not failed else 1


if __name__ == "__main__":
    import urllib.parse  # used in parse_data_uri
    sys.exit(main())
