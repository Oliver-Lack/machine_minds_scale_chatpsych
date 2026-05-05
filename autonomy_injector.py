import random
from datetime import datetime


class AutonomyInjector:
    """This injector is to compute when an
    autonomous backend prompt should fire, and leaves actual API calls to the
    existing chat pipeline so the same loaded agent parameters are used for each backend prompt.
    Only difference is that the backend prompt is used for the "user" message of the injected call.
    """

    DEFAULT_PROMPT = (
        "Continue your immediately previous answer from exactly where it ended.\n"
        "Rules:\n"
        "- Output ONLY the continuation text (no “Continuing…”, no preamble, no commentary).\n"
        "- Do NOT repeat anything you already wrote.\n"
        "- Keep the same tone, formatting, numbering, and structure.\n"
        "- If your last message ended mid-sentence, continue that sentence.\n"
        "- Make this succinct and concise."
    )

    def __init__(self, agent_params):
        self.agent_params = agent_params or {}

        self.enabled = self._as_bool(self.agent_params.get("autonomy_injector", False))
        self.prompt_interval = (
            self._as_int(self.agent_params.get("autonomy_trigger_min_prompts", 1), default=1, minimum=1),
            self._as_int(self.agent_params.get("autonomy_trigger_max_prompts", 3), default=3, minimum=1),
        )
        self.injection_interval = (
            self._as_float(self.agent_params.get("autonomy_delay_min_seconds", 0.5), default=0.5, minimum=0.0),
            self._as_float(self.agent_params.get("autonomy_delay_max_seconds", 2.0), default=2.0, minimum=0.0),
        )
        self.injections_per_trigger_interval = (
            self._as_int(self.agent_params.get("autonomy_injections_min_count", 1), default=1, minimum=1),
            self._as_int(self.agent_params.get("autonomy_injections_max_count", 1), default=1, minimum=1),
        )
        self.prompt = (self.agent_params.get("autonomy_injector_prompt") or self.DEFAULT_PROMPT).strip()

        # Normalize ranges if provided backwards.
        prompt_min, prompt_max = self.prompt_interval
        delay_min, delay_max = self.injection_interval
        inject_min, inject_max = self.injections_per_trigger_interval
        self.prompt_interval = (min(prompt_min, prompt_max), max(prompt_min, prompt_max))
        self.injection_interval = (min(delay_min, delay_max), max(delay_min, delay_max))
        self.injections_per_trigger_interval = (min(inject_min, inject_max), max(inject_min, inject_max))

    def initialize_state(self, state):
        """Ensure required state keys exist and are valid."""
        if state.get("autonomy_enabled") != self.enabled:
            # Reset on config toggle/change so sessions don't keep stale behavior.
            state["autonomy_user_prompt_count"] = 0
            state["autonomy_pending_due_at"] = None
            state["autonomy_pending_injections_remaining"] = 0
            state["autonomy_next_trigger_count"] = self._next_prompt_target() if self.enabled else None

        state["autonomy_enabled"] = self.enabled

        if not self.enabled:
            state["autonomy_user_prompt_count"] = 0
            state["autonomy_pending_due_at"] = None
            state["autonomy_pending_injections_remaining"] = 0
            state["autonomy_next_trigger_count"] = None
            return state

        if not isinstance(state.get("autonomy_user_prompt_count"), int) or state.get("autonomy_user_prompt_count") < 0:
            state["autonomy_user_prompt_count"] = 0

        next_target = state.get("autonomy_next_trigger_count")
        if not isinstance(next_target, int) or next_target < 1:
            state["autonomy_next_trigger_count"] = self._next_prompt_target()

        remaining = state.get("autonomy_pending_injections_remaining")
        if not isinstance(remaining, int) or remaining < 0:
            state["autonomy_pending_injections_remaining"] = 0

        pending_due_at = state.get("autonomy_pending_due_at")
        if pending_due_at is not None:
            try:
                state["autonomy_pending_due_at"] = float(pending_due_at)
            except (TypeError, ValueError):
                state["autonomy_pending_due_at"] = None

        # Keep pending fields consistent.
        if state.get("autonomy_pending_due_at") is None and state.get("autonomy_pending_injections_remaining", 0) > 0:
            state["autonomy_pending_injections_remaining"] = 0
        if state.get("autonomy_pending_due_at") is not None and state.get("autonomy_pending_injections_remaining", 0) < 1:
            state["autonomy_pending_due_at"] = None

        return state

    def register_user_prompt(self, state, now_ts=None):
        """Record one user prompt and schedule a batch of injections when due."""
        self.initialize_state(state)
        if not self.enabled:
            return state

        # This is to reset the user prompt interval between user messages.
        state["autonomy_pending_due_at"] = None
        state["autonomy_pending_injections_remaining"] = 0
        state["autonomy_user_prompt_count"] += 1

        target = state.get("autonomy_next_trigger_count") or self._next_prompt_target()
        if state["autonomy_user_prompt_count"] >= target:
            if now_ts is None:
                now_ts = datetime.now().timestamp()
            delay_seconds = random.uniform(*self.injection_interval)
            state["autonomy_pending_injections_remaining"] = self._next_injection_target()
            state["autonomy_pending_due_at"] = float(now_ts + delay_seconds)

        return state

    def is_due(self, state, now_ts=None):
        """Return True when a scheduled autonomous message should be emitted."""
        self.initialize_state(state)
        if not self.enabled:
            return False

        if int(state.get("autonomy_pending_injections_remaining") or 0) < 1:
            return False

        due_at = state.get("autonomy_pending_due_at")
        if due_at is None:
            return False

        if now_ts is None:
            now_ts = datetime.now().timestamp()
        return float(now_ts) >= float(due_at)

    def mark_injected(self, state, now_ts=None):
        """Advance batch after send; schedule next inject or reset trigger state."""
        self.initialize_state(state)
        if not self.enabled:
            state["autonomy_user_prompt_count"] = 0
            state["autonomy_pending_due_at"] = None
            state["autonomy_pending_injections_remaining"] = 0
            state["autonomy_next_trigger_count"] = None
            return state

        remaining = int(state.get("autonomy_pending_injections_remaining") or 0)
        if remaining > 0:
            remaining -= 1

        if remaining > 0:
            if now_ts is None:
                now_ts = datetime.now().timestamp()
            delay_seconds = random.uniform(*self.injection_interval)
            state["autonomy_pending_injections_remaining"] = remaining
            state["autonomy_pending_due_at"] = float(now_ts + delay_seconds)
            return state

        state["autonomy_user_prompt_count"] = 0
        state["autonomy_pending_due_at"] = None
        state["autonomy_pending_injections_remaining"] = 0
        state["autonomy_next_trigger_count"] = self._next_prompt_target()
        return state

    def _next_prompt_target(self):
        return random.randint(*self.prompt_interval)

    def _next_injection_target(self):
        return random.randint(*self.injections_per_trigger_interval)

    @staticmethod
    def _as_bool(value):
        if isinstance(value, bool):
            return value
        if isinstance(value, str):
            return value.strip().lower() in {"1", "true", "yes", "on"}
        return bool(value)

    @staticmethod
    def _as_int(value, default=0, minimum=None):
        try:
            parsed = int(value)
        except (TypeError, ValueError):
            parsed = default
        if minimum is not None:
            parsed = max(minimum, parsed)
        return parsed

    @staticmethod
    def _as_float(value, default=0.0, minimum=None):
        try:
            parsed = float(value)
        except (TypeError, ValueError):
            parsed = default
        if minimum is not None:
            parsed = max(minimum, parsed)
        return parsed
