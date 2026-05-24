#!/usr/bin/env python3
"""Quick test of OpenAI API key"""
import os
from dotenv import load_dotenv
from pathlib import Path
from openai import OpenAI

# Load environment
ROOT_DIR = Path(__file__).parent / "backend"
load_dotenv(ROOT_DIR / '.env')

api_key = os.environ.get('OPENAI_API_KEY')
print(f"API Key: {api_key[:20]}...{api_key[-4:]}")

try:
    client = OpenAI(api_key=api_key)
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": "Say 'test successful'"}],
        max_tokens=10
    )
    print("✅ OpenAI API Key is VALID")
    print(f"Response: {response.choices[0].message.content}")
except Exception as e:
    print(f"❌ OpenAI API Key is INVALID: {str(e)}")
