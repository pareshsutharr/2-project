"""Legacy hook; live alerts use telegram_alerts.emit_on_trigger_edges_per_rows from trigger_lifecycle."""

from decimal import Decimal

from app.services.telegram_alerts import send_telegram_message


def notify_trigger_hit(script_name: str, side: str, price: Decimal) -> None:
    """Optional one-off message if env is set (no edge dedupe here)."""
    send_telegram_message(f"Trigger {side}\nScript: {script_name}\nPrice: {price}")
