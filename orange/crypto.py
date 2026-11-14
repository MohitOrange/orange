"""Encryption primitives: scrypt key derivation + AES-256-GCM authenticated encryption."""
import os

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.scrypt import Scrypt

KDF_N, KDF_R, KDF_P = 2**15, 8, 1  # ~0.1 s per guess, 32 MB memory: slows brute force


def derive_key(password, salt, n=KDF_N, r=KDF_R, p=KDF_P):
    return Scrypt(salt=salt, length=32, n=n, r=r, p=p).derive(password.encode("utf-8"))


def seal(key, data, aad=b""):
    nonce = os.urandom(12)
    return nonce + AESGCM(key).encrypt(nonce, data, aad)


def unseal(key, blob, aad=b""):
    """Decrypt and verify. Raises InvalidTag if the key is wrong or data was tampered with."""
    return AESGCM(key).decrypt(blob[:12], blob[12:], aad)


__all__ = ["derive_key", "seal", "unseal", "InvalidTag"]
