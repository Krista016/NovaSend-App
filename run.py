#!/usr/bin/env python3
"""
NovaSend - Single Entry Point
Starts the Flask backend server with static file serving for the React frontend.

Usage:
    python run.py              # Start with defaults (0.0.0.0:5000)
    PORT=8080 python run.py    # Custom port
    DEBUG=true python run.py   # Enable Flask debug mode
"""

import os
import sys
import signal
import logging

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def check_frontend_build() -> bool:
    """Check if the React frontend has been built.

    Returns True if dist/index.html exists, False otherwise.
    """
    base_dir = os.path.dirname(os.path.abspath(__file__))
    dist_dir = os.path.join(base_dir, "dist")
    index_html = os.path.join(dist_dir, "index.html")

    if os.path.isfile(index_html):
        logger.info("Frontend build found at %s. Static files will be served.", dist_dir)
        return True

    logger.warning("=" * 60)
    logger.warning("Frontend build NOT found!")
    logger.warning("Run 'npm run build' first to build the React frontend.")
    logger.warning("The backend will start but will NOT serve the frontend.")
    logger.warning("=" * 60)
    return False


def _shutdown_handler(signum, frame):
    """Handle SIGINT / SIGTERM for graceful shutdown."""
    logger.info("Received signal %s. Shutting down gracefully...", signum)
    sys.exit(0)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    """Single entry point for the NovaSend application."""
    logger.info("=== NovaSend Starting ===")

    # 1. Check frontend build
    check_frontend_build()

    # 2. Register signal handlers for graceful shutdown
    signal.signal(signal.SIGINT, _shutdown_handler)
    signal.signal(signal.SIGTERM, _shutdown_handler)

    # 3. Import the Flask app (this triggers create_app() which runs
    #    db.create_all() to initialize database tables)
    try:
        from novasend import app, AccountManager, _add_system_log  # noqa: E402
    except ImportError as e:
        logger.error("Failed to import 'novasend' module: %s", e)
        logger.error(
            "Ensure all dependencies are installed: pip install -r requirements.txt"
        )
        sys.exit(1)

    # 4. Read runtime configuration from environment
    port = int(os.environ.get("PORT", 5000))
    host = os.environ.get("HOST", "0.0.0.0")
    debug = os.environ.get("DEBUG", "false").lower() == "true"

    logger.info("Starting server on %s:%s (debug=%s)", host, port, debug)

    # 5. Auto-reconnect is now controlled by the AUTO_RECONNECT env variable.
    #    Default is OFF — accounts are only connected on-demand when a campaign
    #    is launched, NOT at server startup. Set AUTO_RECONNECT=true to restore
    #    the old behavior where persisted accounts reconnect automatically.
    auto_reconnect = os.environ.get("AUTO_RECONNECT", "false").lower() == "true"
    if auto_reconnect:
        import threading
        import time as time_module

        def _startup_auto_reconnect():
            """Give Flask a moment to initialize, then auto-reconnect accounts."""
            time_module.sleep(2)
            try:
                _add_system_log("run.py: Auto-reconnecting persisted accounts...", "INFO")
                AccountManager.auto_reconnect_accounts()
            except Exception as ex:
                _add_system_log(f"Auto-reconnect error: {ex}", "ERROR")

        reconnect_thread = threading.Thread(
            target=_startup_auto_reconnect, daemon=True
        )
        reconnect_thread.start()
    else:
        _add_system_log("run.py: Auto-reconnect disabled. Accounts will connect on-demand when campaigns launch.", "INFO")

    # 6. Run the Flask development server
    try:
        app.run(host=host, port=port, debug=debug)
    except KeyboardInterrupt:
        logger.info("Keyboard interrupt received. Shutting down.")
    except Exception as e:
        logger.error("Server crashed: %s", e)
        sys.exit(1)
    finally:
        logger.info("=== NovaSend Stopped ===")


if __name__ == "__main__":
    main()