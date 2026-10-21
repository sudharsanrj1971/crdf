"""
Rate-limit (429 / RESOURCE_EXHAUSTED) & transient connection retry patch for CrewAI & LiteLLM.
Automatically catches Gemini 429 rate limit exceptions and transient connection errors,
parses the required delay from the error message (or defaults to 60s/10s), sleeps, and retries up to 5 times.
"""

import sys
import time
import re
import litellm

# Set LiteLLM global fallback settings
litellm.num_retries = 5
litellm.drop_params = True


def parse_retry_delay(err_str: str) -> float:
    """Extract retry delay from error message like 'Please retry in 58.2s'.

    Returns -1.0 if the quota is exhausted for a long period (hours) and
    retrying is pointless — callers should raise immediately.
    """
    # Check for long-duration quota exhaustion (hours) — don't retry these
    h_match = re.search(r'retry in (\d+)h', err_str, re.IGNORECASE)
    if h_match and int(h_match.group(1)) >= 1:
        return -1.0  # signal: don't retry, quota is gone for hours

    m = re.search(r'retry in (\d+(?:\.\d+)?)s', err_str, re.IGNORECASE)
    if not m:
        m = re.search(r'retry after (\d+(?:\.\d+)?)s', err_str, re.IGNORECASE)
    if not m:
        m = re.search(r'wait (\d+(?:\.\d+)?)s', err_str, re.IGNORECASE)
    if m:
        delay = float(m.group(1)) + 2.0  # add 2-second safety margin
        if delay > 300:
            return -1.0  # more than 5 minutes — bail out
        return delay
    if "429" in err_str or "RESOURCE_EXHAUSTED" in err_str or "quota" in err_str.lower():
        # Check for free_tier_requests — daily limit, not worth retrying
        if "free_tier" in err_str.lower() or "per day" in err_str.lower():
            return -1.0
        return 60.0  # default backoff for 15 RPM window
    if "503" in err_str:
        return 3.0  # short backoff for transient 503 spike
    return 3.0  # short backoff for transient connection errors


# 1. Patch LiteLLM
_original_completion = litellm.completion
_original_acompletion = litellm.acompletion


def patched_completion(*args, **kwargs):
    max_retries = 5
    for attempt in range(max_retries):
        try:
            return _original_completion(*args, **kwargs)
        except Exception as e:
            err_str = str(e)
            is_retryable = (
                "429" in err_str or
                "RESOURCE_EXHAUSTED" in err_str or
                "RateLimitError" in type(e).__name__ or
                "rate limit" in err_str.lower() or
                "quota" in err_str.lower() or
                "disconnected" in err_str.lower() or
                "503" in err_str or
                "connection" in err_str.lower()
            )
            if is_retryable and attempt < max_retries - 1:
                delay = parse_retry_delay(err_str)
                if delay < 0:
                    print(
                        f"\n[CRDF LiteLLM] FATAL: Daily quota exhausted — not retrying. Error: '{err_str[:120]}...'",
                        file=sys.stderr, flush=True
                    )
                    raise
                print(
                    f"\n[CRDF LiteLLM Retry] Error detected: '{err_str[:80]}...' (attempt {attempt + 1}/{max_retries}). "
                    f"Sleeping for {delay:.1f}s before retrying...",
                    file=sys.stderr,
                    flush=True
                )
                time.sleep(delay)
            else:
                raise


async def patched_acompletion(*args, **kwargs):
    import asyncio
    max_retries = 5
    for attempt in range(max_retries):
        try:
            return await _original_acompletion(*args, **kwargs)
        except Exception as e:
            err_str = str(e)
            is_retryable = (
                "429" in err_str or
                "RESOURCE_EXHAUSTED" in err_str or
                "RateLimitError" in type(e).__name__ or
                "rate limit" in err_str.lower() or
                "quota" in err_str.lower() or
                "disconnected" in err_str.lower() or
                "503" in err_str or
                "connection" in err_str.lower()
            )
            if is_retryable and attempt < max_retries - 1:
                delay = parse_retry_delay(err_str)
                if delay < 0:
                    print(
                        f"\n[CRDF LiteLLM] FATAL: Daily quota exhausted — not retrying. Error: '{err_str[:120]}...'",
                        file=sys.stderr, flush=True
                    )
                    raise
                print(
                    f"\n[CRDF LiteLLM Retry] Error detected: '{err_str[:80]}...' (async attempt {attempt + 1}/{max_retries}). "
                    f"Sleeping for {delay:.1f}s before retrying...",
                    file=sys.stderr,
                    flush=True
                )
                await asyncio.sleep(delay)
            else:
                raise


litellm.completion = patched_completion
litellm.acompletion = patched_acompletion


# 2. Patch CrewAI's native GeminiCompletion provider
try:
    from crewai.llms.providers.gemini.completion import GeminiCompletion

    _orig_gemini_call = GeminiCompletion.call

    def patched_gemini_call(self, *args, **kwargs):
        max_retries = 5
        for attempt in range(max_retries):
            try:
                return _orig_gemini_call(self, *args, **kwargs)
            except Exception as e:
                err_str = str(e)
                is_retryable = (
                    "429" in err_str or
                    "RESOURCE_EXHAUSTED" in err_str or
                    "RateLimit" in type(e).__name__ or
                    "rate limit" in err_str.lower() or
                    "quota" in err_str.lower() or
                    "disconnected" in err_str.lower() or
                    "503" in err_str or
                    "connection" in err_str.lower()
                )
                if is_retryable and attempt < max_retries - 1:
                    delay = parse_retry_delay(err_str)
                    if delay < 0:
                        print(
                            f"\n[CRDF Gemini] FATAL: Daily quota exhausted — not retrying. Error: '{err_str[:120]}...'",
                            file=sys.stderr, flush=True
                        )
                        raise
                    print(
                        f"\n[CRDF Gemini Retry] API Error: '{err_str[:80]}...' (attempt {attempt + 1}/{max_retries}). "
                        f"Sleeping for {delay:.1f}s before retrying...",
                        file=sys.stderr,
                        flush=True
                    )
                    time.sleep(delay)
                else:
                    raise

    GeminiCompletion.call = patched_gemini_call
    print("[patch_llm_retry] CrewAI GeminiCompletion & LiteLLM 429/connection retry wrappers active.", file=sys.stderr)
except Exception as patch_err:
    print(f"[patch_llm_retry] Note: Could not patch GeminiCompletion directly ({patch_err}), LiteLLM patch active.", file=sys.stderr)
