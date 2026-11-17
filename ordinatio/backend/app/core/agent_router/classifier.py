from enum import Enum
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field
import re

class ComplexityLevel(str, Enum):
    LIGHT = "LIGHT"                      # Simple greetings, short translation, Q&A (e.g. 8B Fast Model)
    MEDIUM = "MEDIUM"                    # General summaries, multi-paragraph writing, explanations
    REASONING_HEAVY = "REASONING_HEAVY"  # Math, coding, algorithm, SQL, complex analytical deduction (e.g. 72B Reasoning Model)
    AGENT_WORKFLOW = "AGENT_WORKFLOW"    # Tool calling, function execution, multi-agent chain

class ClassificationResult(BaseModel):
    complexity: ComplexityLevel
    suggested_tier: str                 # "fast_8b", "reasoning_72b", "agent_worker"
    estimated_tokens: int
    reasons: List[str] = Field(default_factory=list)
    primary_intent: str = "general"
    has_tool_calling: bool = False

# Heuristic patterns for intent & complexity detection in air-gapped envs
REASONING_KEYWORDS = [
    r"(단계별로|증명|도출|알고리즘|시간\s*복잡도|최적화|수학적|방정식|미적분|추론)",
    r"\b(step[-\s]?by[-\s]?step|proof|derive|algorithm|time\s*complexity|deduce|mathematical)\b",
    r"(심층\s*분석|비교\s*분석|정밀\s*검증|논리적\s*추론|인과관계)",
    r"\b(deep\s*analysis|comparative\s*study|rigorous|causal\s*inference)\b"
]

CODING_PATTERNS = [
    r"```[a-zA-Z0-9_-]*\n",              # Code fence
    r"(파이썬|자바스크립트|타입스크립트|리액트|도커|쿠버네티스)",
    r"\b(def\s+[a-zA-Z_]|class\s+[a-zA-Z_]|function\s+[a-zA-Z_]|import\s+[a-zA-Z_]|from\s+[a-zA-Z_])\b",
    r"\b(select\s+.+\s+from\s+|create\s+table|update\s+.+\s+set|delete\s+from)\b",
    r"\b(async\s+def|await\s+|return\s+|console\.log|println!|public\s+static\s+void)\b",
    r"\b(fastapi|pydantic|sqlalchemy|dockerfile|kubernetes|yaml|json|regex|python|javascript)\b"
]

def estimate_tokens(text: str) -> int:
    """Approximate token count for English & Korean text without external heavy tokenizer"""
    if not text:
        return 0
    # Korean characters typically 1.5~2 tokens per word, English ~1.3 tokens per word
    words = text.split()
    char_count = len(text)
    # Balanced heuristic: 1 token ≈ 3.5 characters for mixed Ko/En
    return max(len(words), int(char_count / 3.5))

def classify_prompt(
    messages: List[Dict[str, Any]],
    tools: Optional[List[Dict[str, Any]]] = None,
    functions: Optional[List[Dict[str, Any]]] = None
) -> ClassificationResult:
    """
    Analyzes conversation messages and determines prompt complexity and suggested upstream tier.
    Zero-network, pure air-gapped CPU fast heuristic execution (< 0.5ms).
    """
    reasons = []
    has_tools = bool(tools or functions)

    # 1. Check for explicit tool-calling or agent workflows
    if has_tools:
        reasons.append(f"Function/Tool Calling schema detected ({len(tools or functions)} tools registered)")
        return ClassificationResult(
            complexity=ComplexityLevel.AGENT_WORKFLOW,
            suggested_tier="agent_worker",
            estimated_tokens=0,
            reasons=reasons,
            primary_intent="tool_execution",
            has_tool_calling=True
        )

    # 2. Extract full text from messages
    full_text_list = []
    user_text_list = []
    for msg in messages:
        content = msg.get("content", "")
        if isinstance(content, str):
            full_text_list.append(content)
            if msg.get("role") == "user":
                user_text_list.append(content)

    full_conversation = "\n".join(full_text_list)
    latest_user_prompt = "\n".join(user_text_list) if user_text_list else full_conversation
    token_count = estimate_tokens(full_conversation)

    # 3. Check for coding intent
    is_coding = False
    for pattern in CODING_PATTERNS:
        if re.search(pattern, latest_user_prompt, re.IGNORECASE):
            is_coding = True
            reasons.append(f"Coding/Technical pattern matched: {pattern[:25]}...")
            break

    # 4. Check for deep reasoning / math / analysis intent
    is_reasoning = False
    for pattern in REASONING_KEYWORDS:
        if re.search(pattern, latest_user_prompt, re.IGNORECASE):
            is_reasoning = True
            reasons.append(f"Analytical reasoning keyword matched: {pattern[:25]}...")
            break

    # 5. Length-based heuristics
    is_long_context = token_count > 1500
    if is_long_context:
        reasons.append(f"Long conversation context detected (~{token_count} tokens)")

    # 6. Final Complexity & Tier Decision
    if is_coding or is_reasoning:
        intent = "coding" if is_coding else "reasoning"
        return ClassificationResult(
            complexity=ComplexityLevel.REASONING_HEAVY,
            suggested_tier="reasoning_72b",
            estimated_tokens=token_count,
            reasons=reasons,
            primary_intent=intent,
            has_tool_calling=False
        )

    if is_long_context or len(latest_user_prompt) > 300:
        reasons.append("Moderate message length and conversational context")
        return ClassificationResult(
            complexity=ComplexityLevel.MEDIUM,
            suggested_tier="fast_8b",
            estimated_tokens=token_count,
            reasons=reasons,
            primary_intent="general_writing",
            has_tool_calling=False
        )

    # Default light query (simple conversational Q&A)
    reasons.append("Short prompt with standard conversational query (< 300 chars)")
    return ClassificationResult(
        complexity=ComplexityLevel.LIGHT,
        suggested_tier="fast_8b",
        estimated_tokens=token_count,
        reasons=reasons,
        primary_intent="light_conversation",
        has_tool_calling=False
    )
