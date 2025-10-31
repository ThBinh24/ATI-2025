"""
Quick script to verify Gemini connectivity outside the FastAPI runtime.

Usage:
    python scripts/test_gemini.py

This script loads backend/.env, configures the google-generativeai client using
`GOOGLE_API_KEY`, and prints the response to a small prompt using Gemini 2.5 Flash.
"""

import os
from pathlib import Path

from dotenv import load_dotenv
import google.generativeai as genai

ENV_PATH = Path(__file__).resolve().parent.parent / "backend" / ".env"


def main() -> None:
    load_dotenv(dotenv_path=ENV_PATH)

    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        raise RuntimeError("Missing GOOGLE_API_KEY in backend/.env")

    genai.configure(api_key=api_key)

    model = genai.GenerativeModel(model_name=os.getenv("GEMINI_MODEL_INTERVIEW", "gemini-2.5-flash"))
    prompt = "Quick connectivity test: respond with a short greeting."
    try:
        result = model.generate_content(prompt)
        print("Gemini response:")
        print(result.text)
    except Exception as exc:
        print("Gemini call failed:", exc)


if __name__ == "__main__":
    main()
