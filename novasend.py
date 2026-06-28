#!/usr/bin/env python3
"""
NovaSend Ghost Protocol Agent - Production Edition
SQLAlchemy + JWT Auth + QR Capture + Headless Mode + Static Serving

A production-grade WhatsApp Web automation backend with:
- SQLAlchemy ORM with SQLite (User, Account, Campaign, Contact, Group, CampaignLog)
- JWT authentication (signup, login, protected routes)
- Headless Playwright with QR code capture for WhatsApp Web login
- Multi-account support with per-account browser contexts
- Campaign management with DB persistence and threaded workers
- Static file serving for React SPA in production mode
"""

import threading
import time
import random
import re
import os
import json
import logging
import base64
from datetime import datetime, timedelta
from functools import wraps

from flask import Flask, request, jsonify, send_from_directory, g
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash
import jwt

from playwright.sync_api import sync_playwright
try:
    from playwright_stealth import stealth_sync
    STEALTH_AVAILABLE = True
except ImportError:
    STEALTH_AVAILABLE = False

# =============================================================================
# ANTI-DETECTION: JavaScript to inject into every page to evade bot detection
# =============================================================================
ANTI_DETECTION_SCRIPT = """
// Override navigator.webdriver to bypass basic bot tests
if (navigator.webdriver !== undefined) {
    Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
    });
}

// Basic window.chrome mocking to look like a standard Chrome browser
if (window.chrome === undefined) {
    window.chrome = {
        runtime: {},
        loadTimes: function() { return {}; },
        csi: function() { return {}; },
        app: {}
    };
}

// Remove standard automation markers if present
try {
    delete window.__playwright;
    delete window.__pw_manual;
    delete window.__PW_inspect;
} catch (e) {}

// Standardize permissions query
try {
    const originalQuery = window.navigator.permissions.query;
    window.navigator.permissions.query = (parameters) => (
        parameters.name === 'notifications' ?
            Promise.resolve({ state: Notification.permission }) :
            originalQuery(parameters)
    );
} catch (e) {}
"""

# =============================================================================
# CONFIGURATION
# =============================================================================

BASE_DIR = os.path.abspath(os.path.dirname(__file__))
SECRET_KEY = os.environ.get('SECRET_KEY', 'novasend-secret-key-change-in-production')
DATABASE_URL = os.environ.get('DATABASE_URL', f'sqlite:///{os.path.join(BASE_DIR, "novasend.db")}')
PORT = int(os.environ.get('PORT', 5000))
HEADLESS = os.environ.get('HEADLESS', 'false').lower() == 'true'
JWT_EXPIRATION_HOURS = int(os.environ.get('JWT_EXPIRATION_HOURS', 24))
JWT_ALGORITHM = 'HS256'

# Directory paths
UPLOADS_DIR = os.path.join(BASE_DIR, 'uploads')
QR_CODES_DIR = os.path.join(BASE_DIR, 'qr_codes')
GHOST_DATA_DIR = os.path.join(BASE_DIR, 'novasend_ghost_data')
ACCOUNTS_DATA_DIR = os.path.join(GHOST_DATA_DIR, 'accounts')

# Ensure directories exist
for d in [UPLOADS_DIR, QR_CODES_DIR, GHOST_DATA_DIR, ACCOUNTS_DATA_DIR]:
    os.makedirs(d, exist_ok=True)

# Production mode: True if React build (./dist/) exists
DIST_DIR = os.path.join(BASE_DIR, 'dist')
PRODUCTION = os.path.isdir(DIST_DIR)

# =============================================================================
# LOGGING
# =============================================================================

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('novasend')

# In-memory ring buffer for system logs (max 200 entries)
_system_logs: list = []
_system_logs_lock = threading.Lock()

def _add_system_log(message: str, level: str = 'INFO') -> None:
    """Add a message to the in-memory system log ring buffer."""
    timestamp = datetime.now().strftime('%H:%M:%S')
    entry = {'timestamp': timestamp, 'level': level, 'message': message}
    with _system_logs_lock:
        _system_logs.insert(0, entry)
        if len(_system_logs) > 200:
            _system_logs.pop()
    getattr(logger, level.lower(), logger.info)(message)

# =============================================================================
# FLASK APP FACTORY
# =============================================================================

db = SQLAlchemy()

def create_app() -> Flask:
    """Create and configure the Flask application."""
    app = Flask(__name__, static_folder=None)
    app.config['SECRET_KEY'] = SECRET_KEY
    app.config['SQLALCHEMY_DATABASE_URI'] = DATABASE_URL
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    app.config['SQLALCHEMY_ENGINE_OPTIONS'] = {
        'connect_args': {'check_same_thread': False} if 'sqlite' in DATABASE_URL else {},
    }
    db.init_app(app)
    CORS(app)
    return app

app = create_app()

# =============================================================================
# SQLALCHEMY MODELS
# =============================================================================

class User(db.Model):
    __tablename__ = 'users'

    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(255), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    name = db.Column(db.String(255), nullable=False)
    plan = db.Column(db.String(50), default='Free')
    role = db.Column(db.String(50), default='user')
    account_status = db.Column(db.String(20), default='active')
    last_login_at = db.Column(db.DateTime, nullable=True)
    login_history_json = db.Column(db.Text, default='[]')
    reset_token = db.Column(db.String(255), nullable=True)
    reset_token_expires = db.Column(db.DateTime, nullable=True)
    settings_json = db.Column(db.Text, default='{"theme": "dark", "palette": "nova", "global_placeholders": []}')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    accounts = db.relationship('Account', backref='owner', lazy='dynamic',
                               cascade='all, delete-orphan')
    campaigns = db.relationship('Campaign', backref='owner', lazy='dynamic',
                                cascade='all, delete-orphan')
    contacts = db.relationship('Contact', backref='owner', lazy='dynamic',
                               cascade='all, delete-orphan')
    groups = db.relationship('Group', backref='owner', lazy='dynamic',
                             cascade='all, delete-orphan')

    def to_dict(self) -> dict:
        try:
            settings = json.loads(self.settings_json) if self.settings_json else {}
        except Exception:
            settings = {}
        return {
            'id': self.id,
            'email': self.email,
            'name': self.name,
            'plan': self.plan,
            'role': self.role,
            'account_status': self.account_status,
            'settings': settings,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }


class Account(db.Model):
    __tablename__ = 'accounts'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    name = db.Column(db.String(255), nullable=False)
    whatsapp_number = db.Column(db.String(50), nullable=True)
    status = db.Column(db.String(20), default='Disconnected')  # 'Connected' or 'Disconnected'
    last_error = db.Column(db.Text, nullable=True)
    session_data = db.Column(db.Text, nullable=True)
    
    # Telemetry and Diagnostics Metrics
    successful_sends = db.Column(db.Integer, default=0)
    failed_sends = db.Column(db.Integer, default=0)
    retry_count = db.Column(db.Integer, default=0)
    browser_crashes = db.Column(db.Integer, default=0)
    session_resets = db.Column(db.Integer, default=0)

    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    campaigns = db.relationship('Campaign', backref='account', lazy='dynamic',
                                cascade='all, delete-orphan')

    def to_dict(self) -> dict:
        try:
            rid = str(int(self.id))
        except Exception:
            rid = str(self.id)
        return {
            'id': rid,
            'name': self.name,
            'whatsapp_number': self.whatsapp_number,
            'status': self.status,
            'last_error': self.last_error,
            'successful_sends': self.successful_sends or 0,
            'failed_sends': self.failed_sends or 0,
            'retry_count': self.retry_count or 0,
            'browser_crashes': self.browser_crashes or 0,
            'session_resets': self.session_resets or 0,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }


class Campaign(db.Model):
    __tablename__ = 'campaigns'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    account_id = db.Column(db.Integer, db.ForeignKey('accounts.id'), nullable=False, index=True)
    name = db.Column(db.String(255), nullable=False)
    status = db.Column(db.String(20), default='Draft')
    sent = db.Column(db.Integer, default=0)
    failed = db.Column(db.Integer, default=0)
    total = db.Column(db.Integer, default=0)
    message = db.Column(db.Text, default='')
    attachment_path = db.Column(db.String(500), nullable=True)
    send_as_caption = db.Column(db.Boolean, default=False)
    config_json = db.Column(db.Text, default='{}')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    logs = db.relationship('CampaignLog', backref='campaign', lazy='dynamic',
                           cascade='all, delete-orphan', order_by='CampaignLog.timestamp.desc()')

    def get_config(self) -> dict:
        try:
            return json.loads(self.config_json) if self.config_json else {}
        except (json.JSONDecodeError, TypeError):
            return {}

    def set_config(self, config: dict) -> None:
        self.config_json = json.dumps(config)

    def to_dict(self) -> dict:
        try:
            rid = str(int(self.id))
        except Exception:
            rid = str(self.id)
        return {
            'id': rid,
            'name': self.name,
            'status': self.status,
            'sent': self.sent,
            'failed': self.failed,
            'total': self.total,
            'message': self.message,
            'attachment_path': self.attachment_path,
            'send_as_caption': self.send_as_caption,
            'config': self.get_config(),
            'account_id': str(self.account_id),
            'user_id': self.user_id,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }


class Contact(db.Model):
    __tablename__ = 'contacts'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    number = db.Column(db.String(50), nullable=False)
    first_name = db.Column(db.String(255), default='')
    last_name = db.Column(db.String(255), default='')
    status = db.Column(db.String(50), default='Active')
    groups_json = db.Column(db.Text, default='[]')

    def get_groups(self) -> list:
        try:
            return json.loads(self.groups_json) if self.groups_json else []
        except (json.JSONDecodeError, TypeError):
            return []

    def set_groups(self, groups: list) -> None:
        self.groups_json = json.dumps(groups)

    def to_dict(self) -> dict:
        return {
            'id': str(self.id),
            'number': self.number,
            'firstName': self.first_name,
            'first_name': self.first_name,
            'lastName': self.last_name,
            'last_name': self.last_name,
            'status': self.status,
            'groups': self.get_groups(),
        }


class Group(db.Model):
    __tablename__ = 'groups'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    name = db.Column(db.String(255), nullable=False)

    def to_dict(self) -> dict:
        try:
            rid = str(int(self.id))
        except Exception:
            rid = str(self.id)
        return {
            'id': rid,
            'name': self.name,
        }


class CampaignLog(db.Model):
    __tablename__ = 'campaign_logs'

    id = db.Column(db.Integer, primary_key=True)
    campaign_id = db.Column(db.Integer, db.ForeignKey('campaigns.id'), nullable=False, index=True)
    number = db.Column(db.String(50), nullable=False)
    status = db.Column(db.String(20), nullable=False)  # 'Sent' or 'Failed'
    message_preview = db.Column(db.String(255), default='')
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self) -> dict:
        return {
            'id': self.id,
            'number': self.number,
            'status': self.status,
            'message_preview': self.message_preview,
            'timestamp': self.timestamp.strftime('%H:%M:%S') if self.timestamp else '',
        }


# =============================================================================
# ADMIN PANEL MODELS
# =============================================================================

class ErrorLog(db.Model):
    """Persistent error log for server-side and client-side errors."""
    __tablename__ = 'error_logs'

    id = db.Column(db.Integer, primary_key=True)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow, index=True)
    level = db.Column(db.String(20), default='ERROR', index=True)  # ERROR, WARNING, CRITICAL, INFO
    error_type = db.Column(db.String(100), default='Unknown')
    message = db.Column(db.Text, nullable=False)
    stack_trace = db.Column(db.Text, nullable=True)
    source = db.Column(db.String(50), default='server')  # 'server' or 'client'
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True, index=True)
    user_email = db.Column(db.String(255), nullable=True)
    url = db.Column(db.String(500), nullable=True)
    context_data = db.Column(db.Text, nullable=True)  # JSON string
    resolved = db.Column(db.Boolean, default=False, index=True)
    resolved_at = db.Column(db.DateTime, nullable=True)
    resolved_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)

    def to_dict(self) -> dict:
        return {
            'id': self.id,
            'timestamp': self.timestamp.isoformat() if self.timestamp else None,
            'level': self.level,
            'error_type': self.error_type,
            'message': self.message,
            'stack_trace': self.stack_trace,
            'source': self.source,
            'user_id': self.user_id,
            'user_email': self.user_email,
            'url': self.url,
            'context_data': json.loads(self.context_data) if self.context_data else {},
            'resolved': self.resolved,
            'resolved_at': self.resolved_at.isoformat() if self.resolved_at else None,
            'resolved_by': self.resolved_by,
        }


class AuditLog(db.Model):
    """Tracks all significant admin actions for accountability."""
    __tablename__ = 'audit_logs'

    id = db.Column(db.Integer, primary_key=True)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow, index=True)
    admin_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    admin_email = db.Column(db.String(255), nullable=True)
    action = db.Column(db.String(100), nullable=False, index=True)
    target_type = db.Column(db.String(50), nullable=True)  # 'user', 'campaign', 'setting', etc.
    target_id = db.Column(db.String(50), nullable=True)
    details = db.Column(db.Text, nullable=True)  # JSON string
    ip_address = db.Column(db.String(45), nullable=True)

    def to_dict(self) -> dict:
        return {
            'id': self.id,
            'timestamp': self.timestamp.isoformat() if self.timestamp else None,
            'admin_id': self.admin_id,
            'admin_email': self.admin_email,
            'action': self.action,
            'target_type': self.target_type,
            'target_id': self.target_id,
            'details': json.loads(self.details) if self.details else {},
            'ip_address': self.ip_address,
        }


class SystemSetting(db.Model):
    """Key-value store for system configuration."""
    __tablename__ = 'system_settings'

    id = db.Column(db.Integer, primary_key=True)
    key = db.Column(db.String(100), unique=True, nullable=False, index=True)
    value = db.Column(db.Text, nullable=True)
    category = db.Column(db.String(50), default='general')
    updated_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)

    def to_dict(self) -> dict:
        return {
            'id': self.id,
            'key': self.key,
            'value': self.value,
            'category': self.category,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'updated_by': self.updated_by,
        }


class AdminNotification(db.Model):
    """Notifications that can be broadcast to users."""
    __tablename__ = 'admin_notifications'

    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(255), nullable=False)
    message = db.Column(db.Text, nullable=False)
    notification_type = db.Column(db.String(50), default='info')  # info, warning, success, error
    target_type = db.Column(db.String(20), default='all')  # 'all', 'specific', 'role'
    target_users_json = db.Column(db.Text, default='[]')
    created_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    is_sent = db.Column(db.Boolean, default=False)

    def get_target_users(self) -> list:
        try:
            return json.loads(self.target_users_json) if self.target_users_json else []
        except (json.JSONDecodeError, TypeError):
            return []

    def set_target_users(self, users: list) -> None:
        self.target_users_json = json.dumps(users)

    def to_dict(self) -> dict:
        return {
            'id': self.id,
            'title': self.title,
            'message': self.message,
            'notification_type': self.notification_type,
            'target_type': self.target_type,
            'target_users': self.get_target_users(),
            'created_by': self.created_by,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'is_sent': self.is_sent,
        }


class ScheduledTask(db.Model):
    """Tracks background/scheduled task execution."""
    __tablename__ = 'scheduled_tasks'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(255), nullable=False)
    status = db.Column(db.String(50), default='idle')  # idle, running, completed, failed
    cron_expression = db.Column(db.String(100), nullable=True)
    last_run = db.Column(db.DateTime, nullable=True)
    next_run = db.Column(db.DateTime, nullable=True)
    logs_json = db.Column(db.Text, default='[]')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def get_logs(self) -> list:
        try:
            return json.loads(self.logs_json) if self.logs_json else []
        except (json.JSONDecodeError, TypeError):
            return []

    def add_log(self, message: str, level: str = 'INFO') -> None:
        logs = self.get_logs()
        logs.append({
            'timestamp': datetime.utcnow().isoformat(),
            'level': level,
            'message': message,
        })
        if len(logs) > 500:
            logs = logs[-500:]
        self.logs_json = json.dumps(logs)

    def to_dict(self) -> dict:
        return {
            'id': self.id,
            'name': self.name,
            'status': self.status,
            'cron_expression': self.cron_expression,
            'last_run': self.last_run.isoformat() if self.last_run else None,
            'next_run': self.next_run.isoformat() if self.next_run else None,
            'logs': self.get_logs(),
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }


# =============================================================================
# DATABASE MIGRATION HELPER
# =============================================================================

def _migrate_database():
    """Add any missing columns/tables to existing databases."""
    from sqlalchemy import inspect, text
    inspector = inspect(db.engine)

    # Ensure new tables exist
    existing_tables = inspector.get_table_names()
    for table_name in ['error_logs', 'audit_logs', 'system_settings',
                        'admin_notifications', 'scheduled_tasks']:
        if table_name not in existing_tables:
            db.create_all()
            _add_system_log(f"Created missing table: {table_name}", 'INFO')
            return  # create_all handles all missing tables at once

    # Add missing columns to users table
    user_columns = {col['name'] for col in inspector.get_columns('users')}
    user_migrations = {
        'role': "ALTER TABLE users ADD COLUMN role VARCHAR(50) DEFAULT 'user'",
        'last_login_at': "ALTER TABLE users ADD COLUMN last_login_at DATETIME",
        'account_status': "ALTER TABLE users ADD COLUMN account_status VARCHAR(20) DEFAULT 'active'",
        'login_history_json': "ALTER TABLE users ADD COLUMN login_history_json TEXT DEFAULT '[]'",
        'reset_token': "ALTER TABLE users ADD COLUMN reset_token VARCHAR(255)",
        'reset_token_expires': "ALTER TABLE users ADD COLUMN reset_token_expires DATETIME",
        'settings_json': "ALTER TABLE users ADD COLUMN settings_json TEXT DEFAULT '{\"theme\": \"dark\", \"palette\": \"nova\", \"global_placeholders\": []}'",
    }
    for col_name, sql in user_migrations.items():
        if col_name not in user_columns:
            try:
                db.session.execute(text(sql))
                db.session.commit()
                _add_system_log(f"Added column '{col_name}' to users table.", 'INFO')
            except Exception as e:
                db.session.rollback()
                _add_system_log(f"Migration for '{col_name}' skipped: {e}", 'WARNING')

    # Add missing columns to accounts table
    if 'accounts' in existing_tables:
        account_columns = {col['name'] for col in inspector.get_columns('accounts')}
        account_migrations = {
            'last_error': "ALTER TABLE accounts ADD COLUMN last_error TEXT",
            'session_data': "ALTER TABLE accounts ADD COLUMN session_data TEXT",
            'successful_sends': "ALTER TABLE accounts ADD COLUMN successful_sends INTEGER DEFAULT 0",
            'failed_sends': "ALTER TABLE accounts ADD COLUMN failed_sends INTEGER DEFAULT 0",
            'retry_count': "ALTER TABLE accounts ADD COLUMN retry_count INTEGER DEFAULT 0",
            'browser_crashes': "ALTER TABLE accounts ADD COLUMN browser_crashes INTEGER DEFAULT 0",
            'session_resets': "ALTER TABLE accounts ADD COLUMN session_resets INTEGER DEFAULT 0",
        }
        for col_name, sql in account_migrations.items():
            if col_name not in account_columns:
                try:
                    db.session.execute(text(sql))
                    db.session.commit()
                    _add_system_log(f"Added column '{col_name}' to accounts table.", 'INFO')
                except Exception as e:
                    db.session.rollback()
                    _add_system_log(f"Migration for '{col_name}' skipped: {e}", 'WARNING')


# Create all database tables (must be called after all models are defined)
with app.app_context():
    db.create_all()
    _migrate_database()
    # Reset all accounts to Disconnected on startup — browser sessions
    # do not survive server restarts, so no account is truly connected.
    stale_connected = Account.query.filter_by(status='Connected').count()
    if stale_connected > 0:
        Account.query.filter_by(status='Connected').update(
            {'status': 'Disconnected'}
        )
        db.session.commit()
        _add_system_log(
            f"Reset {stale_connected} stale account(s) to Disconnected.",
            'INFO'
        )

# =============================================================================
# JWT AUTHENTICATION UTILITIES
# =============================================================================

def generate_jwt(user_id: int) -> str:
    """Generate a JWT token for the given user ID."""
    payload = {
        'user_id': user_id,
        'exp': datetime.utcnow() + timedelta(hours=JWT_EXPIRATION_HOURS),
        'iat': datetime.utcnow(),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=JWT_ALGORITHM)


def decode_jwt(token: str) -> dict:
    """Decode and validate a JWT token. Returns payload or raises."""
    return jwt.decode(token, SECRET_KEY, algorithms=[JWT_ALGORITHM])


def login_required(f):
    """Decorator that enforces JWT authentication on a route.

    Extracts the Bearer token from the Authorization header, decodes it,
    and sets g.current_user to the authenticated User object.
    Returns 401 if the token is missing, invalid, or expired.
    """
    @wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get('Authorization', '')
        if not auth_header.startswith('Bearer '):
            return jsonify({'status': 'error', 'message': 'Missing or invalid Authorization header.'}), 401

        token = auth_header[7:]
        try:
            payload = decode_jwt(token)
        except jwt.ExpiredSignatureError:
            return jsonify({'status': 'error', 'message': 'Token has expired.'}), 401
        except jwt.InvalidTokenError:
            return jsonify({'status': 'error', 'message': 'Invalid token.'}), 401

        user = User.query.get(payload.get('user_id'))
        if not user:
            return jsonify({'status': 'error', 'message': 'User not found.'}), 401

        g.current_user = user
        return f(*args, **kwargs)
    return decorated


def admin_required(roles=None):
    """Decorator that enforces admin role-based access control.

    Must be used AFTER @login_required. Checks that the authenticated user
    has one of the allowed roles. If roles is None, any admin role is accepted.

    Args:
        roles: List of allowed role strings (e.g., ['super_admin', 'support']).
               If None, any role other than 'user' is allowed.
    """
    if roles is None:
        roles = ['super_admin', 'admin', 'support', 'auditor']

    def decorator(f):
        @wraps(f)
        def decorated(*args, **kwargs):
            user = g.current_user
            user_role = getattr(user, 'role', 'user') or 'user'
            if user_role not in roles:
                return jsonify({
                    'status': 'error',
                    'message': f'Insufficient permissions. Required role: {", ".join(roles)}.'
                }), 403
            return f(*args, **kwargs)
        return decorated
    return decorator


# =============================================================================
# ERROR LOGGING UTILITY
# =============================================================================

def log_error(level: str, error_type: str, message: str, stack_trace: str = None,
              source: str = 'server', user_id: int = None, user_email: str = None,
              url: str = None, context_data: dict = None) -> ErrorLog:
    """Log an error to the persistent ErrorLog table and the in-memory ring buffer.

    Args:
        level: ERROR, WARNING, CRITICAL, or INFO
        error_type: Short category (e.g., 'DatabaseError', 'AuthError')
        message: Human-readable error description
        stack_trace: Full stack trace if available
        source: 'server' or 'client'
        user_id: Affected user ID
        user_email: Affected user email
        url: URL where the error occurred
        context_data: Additional JSON-serializable context

    Returns:
        The created ErrorLog instance.
    """
    try:
        error_entry = ErrorLog(
            level=level,
            error_type=error_type,
            message=message,
            stack_trace=stack_trace,
            source=source,
            user_id=user_id,
            user_email=user_email,
            url=url,
            context_data=json.dumps(context_data) if context_data else None,
        )
        db.session.add(error_entry)
        db.session.commit()

        # Also add to in-memory ring buffer
        log_msg = f"[{level}] [{error_type}] {message}"
        _add_system_log(log_msg, level)

        return error_entry
    except Exception as e:
        # Fallback: at minimum log to the in-memory buffer
        _add_system_log(f"Failed to persist error log: {e}. Original: [{level}] {message}", 'ERROR')
        return None


# =============================================================================
# AUDIT LOGGING UTILITY
# =============================================================================

def log_audit(admin_id: int, action: str, target_type: str = None,
              target_id: str = None, details: dict = None) -> AuditLog:
    """Create an audit log entry for an admin action.

    Args:
        admin_id: ID of the admin performing the action
        action: Action description (e.g., 'user_deleted', 'password_reset')
        target_type: Type of target (e.g., 'user', 'campaign', 'setting')
        target_id: ID of the target
        details: Additional JSON-serializable details

    Returns:
        The created AuditLog instance.
    """
    try:
        admin = User.query.get(admin_id)
        admin_email = admin.email if admin else 'Unknown'
        ip_address = request.remote_addr if request else None

        audit_entry = AuditLog(
            admin_id=admin_id,
            admin_email=admin_email,
            action=action,
            target_type=target_type,
            target_id=str(target_id) if target_id else None,
            details=json.dumps(details) if details else None,
            ip_address=ip_address,
        )
        db.session.add(audit_entry)
        db.session.commit()
        return audit_entry
    except Exception as e:
        _add_system_log(f"Failed to create audit log: {e}", 'ERROR')
        return None


# =============================================================================
# MESSAGE PROCESSING LOGIC
# =============================================================================

def process_spintax(text: str) -> str:
    """Process spintax patterns like {option1|option2|option3}."""
    pattern = re.compile(r'\{([^{}]*\|[^{}]*)\}')
    while True:
        match = pattern.search(text)
        if not match:
            break
        options_string = match.group(1)
        options = options_string.split('|')
        chosen_option = random.choice(options)
        text = text[:match.start()] + chosen_option + text[match.end():]
    return text



def personalize_message(text: str, contact: dict) -> str:
    """Replace {FirstName} and {LastName} placeholders with contact data."""
    first_name = contact.get('firstName', '') or contact.get('first_name', '')
    last_name = contact.get('lastName', '') or contact.get('last_name', '')
    text = text.replace('{FirstName}', first_name).replace('{LastName}', last_name)
    return text


def apply_global_placeholders(text: str, placeholders: list) -> str:
    """Replace {{key}} placeholders with values from the global placeholders list."""
    for p in placeholders:
        key = p.get('key')
        value = p.get('value')
        if key and value:
            text = text.replace('{{' + key + '}}', value)
    return text


def format_message(text: str) -> str:
    """Convert pipe characters to newlines for multi-line messages."""
    return text.replace('|', '\n')


def process_message_for_contact(template: str, contact: dict, placeholders: list) -> str:
    """Apply all message processing: placeholders, personalization, spintax, formatting."""
    message = apply_global_placeholders(template, placeholders)
    message = personalize_message(message, contact)
    message = process_spintax(message)
    return format_message(message)


# =============================================================================
# FILE HANDLING (SHARED FOLDER METHOD)
# =============================================================================

def _find_attachment_in_shared_folder() -> tuple:
    """Finds the first file in the user's Downloads/Attach folder.

    Returns:
        Tuple of (file_path, status_message). file_path is None if not found.
    """
    try:
        downloads_path = os.path.join(os.path.expanduser('~'), 'Downloads')
        attach_folder = os.path.join(downloads_path, 'Attach')

        if not os.path.isdir(attach_folder):
            _add_system_log("Attachment folder '~/Downloads/Attach' not found.", 'WARNING')
            return None, "Folder not found"

        files = []
        for f in os.listdir(attach_folder):
            path = os.path.join(attach_folder, f)
            if not os.path.isfile(path):
                continue

            ext = os.path.splitext(f)[1].lower()
            # Adjust supported media here as needed.
            if ext not in {'.txt', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.pdf', '.doc', '.docx', '.mp4', '.mov'}:
                _add_system_log(f"Skipping unsupported attachment: {f}", 'WARNING')
                continue

            files.append(f)

        if not files:
            _add_system_log("No supported file found in '~/Downloads/Attach'.", 'WARNING')
            return None, "No supported file found"

        if len(files) > 1:
            _add_system_log(f"Warning: Multiple files found. Using the first one: {files[0]}", 'WARNING')

        return os.path.join(attach_folder, files[0]), "File found"

    except Exception as e:
        _add_system_log(f"Error accessing attachment folder: {e}", 'ERROR')
        return None, "Error accessing folder"


# =============================================================================
# GHOST PROTOCOL: CORE BEHAVIORS (page-aware)
# =============================================================================

def _generate_bezier_points(start_x, start_y, end_x, end_y, num_points):
    # Generates a smooth cubic bezier curve
    dx = end_x - start_x
    dy = end_y - start_y
    dist = (dx**2 + dy**2)**0.5
    dev = dist * random.uniform(0.1, 0.25)
    
    ox1 = dev * random.uniform(-1, 1)
    oy1 = dev * random.uniform(-1, 1)
    ox2 = dev * random.uniform(-1, 1)
    oy2 = dev * random.uniform(-1, 1)
    
    control_x1 = start_x + dx * 0.25 + ox1
    control_y1 = start_y + dy * 0.25 + oy1
    control_x2 = start_x + dx * 0.75 + ox2
    control_y2 = start_y + dy * 0.75 + oy2
    
    points = []
    for i in range(num_points):
        t = i / (num_points - 1)
        x = (1-t)**3 * start_x + 3*(1-t)**2*t * control_x1 + 3*(1-t)*t**2 * control_x2 + t**3 * end_x
        y = (1-t)**3 * start_y + 3*(1-t)**2*t * control_y1 + 3*(1-t)*t**2 * control_y2 + t**3 * end_y
        points.append((x, y))
    return points

def _move_mouse_bezier(page, end_x, end_y):
    try:
        last_pos = getattr(page, '_last_mouse_pos', None)
        if last_pos is None:
            last_pos = (random.uniform(100, 500), random.uniform(100, 500))
        
        start_x, start_y = last_pos
        dist = ((end_x - start_x)**2 + (end_y - start_y)**2)**0.5
        
        # Decide if we overshoot (15% chance for distance > 150px)
        overshoot = False
        if dist > 150 and random.random() < 0.15:
            overshoot = True
            
        if overshoot:
            # Calculate overshoot target along the movement direction vector
            dx = end_x - start_x
            dy = end_y - start_y
            unit_x = dx / dist
            unit_y = dy / dist
            overshoot_dist = random.uniform(10, 25)
            temp_end_x = end_x + unit_x * overshoot_dist
            temp_end_y = end_y + unit_y * overshoot_dist
            
            # Phase 1: Move to the overshoot target
            num_points_1 = max(15, min(50, int(dist / 12)))
            points_1 = _generate_bezier_points(start_x, start_y, temp_end_x, temp_end_y, num_points_1)
            for x, y in points_1:
                # Add micro-jitter (tremors)
                jx = x + random.uniform(-0.5, 0.5)
                jy = y + random.uniform(-0.5, 0.5)
                page.mouse.move(jx, jy)
                time.sleep(random.uniform(0.003, 0.008))
                
            # Human reaction time pause before correcting
            time.sleep(random.uniform(0.12, 0.28))
            
            # Phase 2: Correct path slide back to actual target
            num_points_2 = max(8, min(20, int(overshoot_dist / 2)))
            points_2 = _generate_bezier_points(temp_end_x, temp_end_y, end_x, end_y, num_points_2)
            for x, y in points_2:
                jx = x + random.uniform(-0.3, 0.3)
                jy = y + random.uniform(-0.3, 0.3)
                page.mouse.move(jx, jy)
                time.sleep(random.uniform(0.006, 0.012))
        else:
            # Normal smooth bezier movement with minor micro-jitter
            num_points = max(15, min(50, int(dist / 12)))
            points = _generate_bezier_points(start_x, start_y, end_x, end_y, num_points)
            for x, y in points:
                jx = x + random.uniform(-0.5, 0.5)
                jy = y + random.uniform(-0.5, 0.5)
                page.mouse.move(jx, jy)
                time.sleep(random.uniform(0.004, 0.009))
            
        setattr(page, '_last_mouse_pos', (end_x, end_y))
    except Exception:
        try:
            page.mouse.move(end_x, end_y)
            setattr(page, '_last_mouse_pos', (end_x, end_y))
        except:
            pass

def _move_and_click_humanly(page, locator) -> None:
    """Human-like mouse movement and click using Playwright's mouse API."""
    try:
        box = locator.bounding_box()
        if not box:
            locator.click(timeout=5000)
            return
        target_x = box['x'] + random.uniform(box['width'] * 0.2, box['width'] * 0.8)
        target_y = box['y'] + random.uniform(box['height'] * 0.2, box['height'] * 0.8)
        _move_mouse_bezier(page, target_x, target_y)
        
        # Pre-click eye-coordination check pause
        time.sleep(random.uniform(0.15, 0.4))
        page.mouse.click(target_x, target_y)
    except Exception:
        try:
            locator.click(timeout=5000)
        except Exception:
            pass

def _human_like_typing_with_flaws(page, text: str) -> None:
    """Types text with human-like flaws using Playwright's keyboard API."""
    # Dynamic typing speed profiles per block
    profile = random.choice(['slow', 'avg', 'fast'])
    if profile == 'slow':
        min_key_delay, max_key_delay = 0.12, 0.22
    elif profile == 'fast':
        min_key_delay, max_key_delay = 0.04, 0.08
    else: # avg
        min_key_delay, max_key_delay = 0.07, 0.13

    # QWERTY Adjacency Map for realistic finger slips
    qwerty_neighbors = {
        'a': 'qwsz', 'b': 'vghn', 'c': 'xdfv', 'd': 'ersfxc', 'e': 'wsdr',
        'f': 'rtgvcd', 'g': 'tyhbvf', 'h': 'yujnbg', 'i': 'ujko', 'j': 'uikmnh',
        'k': 'ijlm', 'l': 'okp', 'm': 'njk', 'n': 'bhjm', 'o': 'iklp',
        'p': 'ol', 'q': 'wa', 'r': 'edft', 's': 'wedxza', 't': 'rfgy',
        'u': 'yhji', 'v': 'cfgb', 'w': 'qase', 'x': 'zsdc', 'y': 'tghu', 'z': 'asx'
    }

    lines = text.split('\n')
    for idx, line in enumerate(lines):
        i = 0
        while i < len(line):
            char = line[i]
            lower_char = char.lower()
            
            # 3% chance to make a physical typo (only on alphabetical characters)
            make_typo = False
            if lower_char in qwerty_neighbors and i > 0 and line[i-1] != ' ' and random.random() < 0.03:
                make_typo = True
                
            if make_typo:
                wrong_char = random.choice(qwerty_neighbors[lower_char])
                if char.isupper():
                    wrong_char = wrong_char.upper()
                
                # Type the incorrect key
                page.keyboard.type(wrong_char)
                time.sleep(random.uniform(min_key_delay, max_key_delay))
                
                # 85% chance to correct it, 15% chance to leave it uncorrected if message is long
                correct_typo = True
                if len(text) > 30 and random.random() < 0.15:
                    correct_typo = False
                    
                if correct_typo:
                    # Typist reaction delay before backspace correction
                    time.sleep(random.uniform(0.12, 0.28))
                    page.keyboard.press('Backspace')
                    time.sleep(random.uniform(min_key_delay, max_key_delay))
                    # Retype the correct key
                    page.keyboard.type(char)
                else:
                    # Uncorrected! Leave the typo in place.
                    pass
            else:
                page.keyboard.type(char)
                
            # Typing speed variability
            delay = random.uniform(min_key_delay, max_key_delay)
            
            # Add pauses at sentence/clause boundaries
            if char in ['.', '!', '?']:
                delay += random.uniform(0.4, 0.8)
            elif char in [',', ';', ':', '-']:
                delay += random.uniform(0.2, 0.5)
            elif char == ' ':
                if random.random() < 0.25:
                    delay += random.uniform(0.1, 0.3)
                    
            time.sleep(delay)
            i += 1
            
        if idx < len(lines) - 1:
            page.keyboard.down('Shift')
            page.keyboard.press('Enter')
            page.keyboard.up('Shift')
            time.sleep(random.uniform(0.18, 0.35))

def _clear_search_box(page):
    try:
        search_selectors = [
            'div[contenteditable="true"][data-tab="3"]',
            'div[data-testid="chat-list-search"]',
            '//div[@contenteditable="true"][@data-tab="3"]',
            '//div[contains(@class, "lexical-rich-text")]//div[@role="textbox"]',
        ]
        search_box = None
        for sel in search_selectors:
            try:
                el = page.locator(sel).first
                if el.is_visible(timeout=500):
                    search_box = el
                    break
            except:
                continue
        if search_box:
            _move_and_click_humanly(page, search_box)
            page.keyboard.down('Control')
            page.keyboard.press('a')
            page.keyboard.up('Control')
            time.sleep(0.1)
            page.keyboard.press('Backspace')
            time.sleep(0.2)
            
            clear_btn = page.locator('//span[@data-icon="x-alt"]/ancestor::button|//span[@data-icon="back"]/ancestor::button').first
            if clear_btn.is_visible(timeout=500):
                clear_btn.click(timeout=1000)
    except:
        pass

def _find_and_open_chat_via_search(page, number, log_func=None):
    def _log(msg):
        if log_func:
            log_func(msg)
            
    try:
        try:
            header_title = page.locator('//header[@data-testid="conversation-header"]//span[@dir="auto"]').first
            if header_title.is_visible(timeout=500):
                title_text = header_title.text_content()
                clean_num = "".join(filter(str.isdigit, number))
                clean_title = "".join(filter(str.isdigit, title_text))
                if clean_num[-8:] in clean_title or clean_title[-8:] in clean_num:
                    _log(f"Already in chat with {number}.")
                    return True
        except:
            pass

        search_selectors = [
            'div[contenteditable="true"][data-tab="3"]',
            'div[data-testid="chat-list-search"]',
            '//div[@contenteditable="true"][@data-tab="3"]',
            '//div[contains(@class, "lexical-rich-text")]//div[@role="textbox"]',
            '//div[@data-testid="chat-list-search"]//div[@role="textbox"]',
        ]
        search_box = None
        for sel in search_selectors:
            try:
                el = page.locator(sel).first
                if el.is_visible(timeout=1000):
                    search_box = el
                    break
            except:
                continue
        if not search_box:
            return False
            
        _move_and_click_humanly(page, search_box)
        time.sleep(random.uniform(0.2, 0.4))
        
        page.keyboard.down('Control')
        page.keyboard.press('a')
        page.keyboard.up('Control')
        time.sleep(0.1)
        page.keyboard.press('Backspace')
        time.sleep(random.uniform(0.1, 0.2))
        
        clean_search = "".join(filter(str.isdigit, number))
        search_term = number
        if not number.startswith('+') and len(clean_search) > 10:
            search_term = "+" + clean_search
            
        _log(f"Searching for contact {search_term}...")
        _human_like_typing_with_flaws(page, search_term)
        time.sleep(random.uniform(2.0, 3.5))
        
        chat_item_selectors = [
            '//div[@data-testid="chat-list-item"]',
            '//div[@role="row" and @data-testid]',
            '//div[contains(@class, "chat-list-item")]',
            '//div[@role="row"]',
        ]
        
        chat_row = None
        for sel in chat_item_selectors:
            try:
                elements = page.locator(sel)
                count = elements.count()
                for i in range(count):
                    el = elements.nth(i)
                    if el.is_visible(timeout=500):
                        text = el.text_content() or ""
                        clean_text = "".join(filter(str.isdigit, text))
                        if clean_search[-6:] in clean_text or "chat" in text.lower() or "search" in text.lower():
                            chat_row = el
                            break
                if chat_row:
                    break
            except:
                continue
                
        if chat_row:
            _log("Match found in search list. Opening chat...")
            _move_and_click_humanly(page, chat_row)
            scan_delay = random.uniform(1.5, 3.0)
            _log(f"Simulating human scanning delay of {scan_delay:.1f} seconds...")
            time.sleep(scan_delay)
            
            try:
                main_message_box = page.locator('//footer//div[@role="textbox"]').first
                if main_message_box.is_visible(timeout=3000):
                    _clear_search_box(page)
                    return True
            except:
                pass
                
        _clear_search_box(page)
        return False
    except Exception as e:
        _log(f"Search-based opening error: {e}")
        _clear_search_box(page)
        return False


# =============================================================================
# GHOST PROTOCOL: IDLE SIMULATION TASKS
# =============================================================================

def _idle_task_check_statuses(page) -> None:
    """Simulate checking WhatsApp statuses as idle behavior."""
    try:
        _add_system_log("Idle Task: Checking statuses...", 'DEBUG')
        status_button = page.locator(
            "//span[@data-icon='status-v3-outline']/ancestor::div[@role='button']"
        ).first
        _move_and_click_humanly(page, status_button)
        time.sleep(random.uniform(1.0, 2.0))
        chats_button = page.locator(
            "//span[@data-icon='chat']/ancestor::div[@role='button']"
        ).first
        _move_and_click_humanly(page, chats_button)
        time.sleep(random.uniform(0.5, 1.0))
        _add_system_log("Idle Task: Status check complete.", 'DEBUG')
    except Exception as e:
        _add_system_log(f"Idle Task failed: {e}", 'DEBUG')


def _idle_task_scroll_chat_list(page) -> None:
    """Simulate aimlessly scrolling the chat list as idle behavior."""
    try:
        _add_system_log("Idle Task: Aimlessly scrolling chat list...", 'DEBUG')
        pane_side = page.locator('#pane-side').first
        for _ in range(random.randint(1, 3)):
            scroll_amount = random.randint(-300, 300)
            pane_side.evaluate('(el, amount) => el.scrollTop += amount', scroll_amount)
            time.sleep(random.uniform(0.5, 1.5))
        _add_system_log("Idle Task: Chat list scroll complete.", 'DEBUG')
    except Exception as e:
        _add_system_log(f"Idle Task failed: {e}", 'DEBUG')


def _idle_task_hover_chats(page) -> None:
    """Simulate hovering over chat elements in sidebar."""
    try:
        _add_system_log("Idle Task: Hovering chats...", 'DEBUG')
        chat_items = page.locator('div[role="row"], div[data-testid="chat-list-item"]').all()
        if chat_items:
            target = random.choice(chat_items[:5])
            box = target.bounding_box()
            if box:
                target_x = box['x'] + random.uniform(box['width'] * 0.2, box['width'] * 0.8)
                target_y = box['y'] + random.uniform(box['height'] * 0.2, box['height'] * 0.8)
                _move_mouse_bezier(page, target_x, target_y)
                time.sleep(random.uniform(0.5, 1.5))
    except Exception as e:
        _add_system_log(f"Idle Task failed: {e}", 'DEBUG')


def _idle_task_mouse_wander(page) -> None:
    """Simulate aimless mouse wandering."""
    try:
        _add_system_log("Idle Task: Wandering mouse...", 'DEBUG')
        for _ in range(random.randint(2, 4)):
            x = random.uniform(200, 1000)
            y = random.uniform(200, 800)
            _move_mouse_bezier(page, x, y)
            time.sleep(random.uniform(0.4, 1.2))
    except Exception as e:
        _add_system_log(f"Idle Task failed: {e}", 'DEBUG')


def _simulate_idle_activity(page) -> None:
    """Randomly pick and execute an idle simulation task."""
    approved_tasks = [_idle_task_check_statuses, _idle_task_scroll_chat_list, _idle_task_hover_chats, _idle_task_mouse_wander]
    random.choice(approved_tasks)(page)



# =============================================================================
# CORE WHATSAPP AUTOMATION (page-aware)
# =============================================================================

def _attach_file_reliably(page, file_path: str, max_retries: int = 3) -> None:
    """Attach a file using Playwright's native file chooser handling.

    No PyAutoGUI needed - Playwright intercepts the OS file dialog directly.
    Includes retry logic for resilience against timing issues.
    """
    _add_system_log(
        f"Attachment protocol (Playwright) initiated for {os.path.basename(file_path)}.",
        'DEBUG'
    )

    media_extensions = ['.jpg', '.jpeg', '.png', '.gif', '.mp4', '.mov', '.avi', '.mkv', '.webp']
    file_extension = os.path.splitext(file_path)[1].lower()

    if file_extension in media_extensions:
        file_type_button_text = 'Photos & videos'
        _add_system_log("File type is media. Locating 'Photos & videos' button.", 'DEBUG')
    else:
        file_type_button_text = 'Document'
        _add_system_log("File type is document. Locating 'Document' button.", 'DEBUG')

    for attempt in range(1, max_retries + 1):
        try:
            _add_system_log(f"Attachment attempt {attempt}/{max_retries}.", 'DEBUG')

            # Robust attach button selection
            attach_button_selectors = [
                '//span[@data-icon="plus-rounded"]/ancestor::button',
                '//span[@data-icon="plus"]/ancestor::button',
                '//span[@data-icon="attach-menu-plus"]/ancestor::button',
                '//button[@aria-label="Attach"]',
                '//div[@role="button"]//span[@data-icon="plus"]',
                '//button[.//span[@data-icon="plus"]]',
            ]
            attach_button = None
            for sel in attach_button_selectors:
                try:
                    el = page.locator(sel).first
                    if el.is_visible(timeout=2000):
                        attach_button = el
                        break
                except:
                    continue
            if not attach_button:
                attach_button = page.locator('//span[@data-icon="plus-rounded"]/ancestor::button').first
            
            attach_button.wait_for(state='visible', timeout=15000)
            time.sleep(random.uniform(0.3, 0.6))
            attach_button.click()
            _add_system_log("Attach (+) button clicked. Waiting for menu...", 'DEBUG')
            time.sleep(random.uniform(0.8, 1.2))

            # Case-insensitive robust file type button selection using Playwright regex filter
            if file_type_button_text == 'Photos & videos':
                pattern = re.compile(r'Photos\s*&\s*Videos', re.IGNORECASE)
            else:
                pattern = re.compile(r'Document', re.IGNORECASE)

            file_type_button = page.locator('li, button, div[role="button"], span').filter(has_text=pattern).first
            file_type_button.wait_for(state='visible', timeout=10000)

            with page.expect_file_chooser(timeout=30000) as fc_info:
                file_type_button.click()

            file_chooser = fc_info.value
            file_chooser.set_files(file_path)
            _add_system_log("File selected via Playwright file chooser.", 'DEBUG')
            return

        except Exception as e:
            _add_system_log(f"Attachment attempt {attempt} failed: {e}", 'DEBUG')
            if attempt < max_retries:
                try:
                    page.keyboard.press('Escape')
                except Exception:
                    pass
                time.sleep(random.uniform(1.0, 2.0))
            else:
                _add_system_log(
                    f"FATAL: All {max_retries} attachment attempts failed.", 'ERROR'
                )
                raise Exception(f"Failed to attach file after {max_retries} attempts: {e}")


def _find_caption_box(page):
    """Finds the caption input textbox on the attachment preview screen.

    Returns the Locator if found, None otherwise.
    """
    caption_box_selectors = [
        '//div[@aria-label="Send photo"]//div[@role="textbox"]',
        '//div[@aria-label="Send video"]//div[@role="textbox"]',
        '//div[@aria-label="Send document"]//div[@role="textbox"]',
        '//div[contains(@class, "_amig")]//div[@role="textbox"]',
        '//div[@data-animate-modal-body="1"]//div[@role="textbox"]',
        '//div[contains(@class, "g0rxnol2")]//div[@role="textbox"]',
        '//div[@role="dialog"]//div[@role="textbox"]',
    ]
    for i, selector in enumerate(caption_box_selectors):
        try:
            _add_system_log(f"Searching for caption box with selector #{i + 1}.", 'DEBUG')
            locator = page.locator(selector).first
            locator.wait_for(state='visible', timeout=5000)
            _add_system_log(f"Caption box found with selector #{i + 1}.", 'DEBUG')
            return locator
        except Exception:
            _add_system_log(f"  - Caption box selector #{i + 1} not found. Trying next...", 'DEBUG')
            continue

    # Last-resort fallback: find ANY visible textbox outside footer
    try:
        _add_system_log("Attempting last-resort caption box search: any textbox outside footer.", 'DEBUG')
        all_textboxes = page.locator('//div[@role="textbox"]')
        count = all_textboxes.count()
        for idx in range(count):
            tb = all_textboxes.nth(idx)
            parent_footer = tb.locator('xpath=ancestor::footer')
            if parent_footer.count() == 0 and tb.is_visible():
                _add_system_log(
                    f"Last-resort caption box found (textbox #{idx + 1} of {count}).", 'DEBUG'
                )
                return tb
    except Exception as e:
        _add_system_log(f"Last-resort caption box search failed: {e}", 'DEBUG')

    _add_system_log("WARNING: Could not find caption box on preview screen.", 'WARNING')
    return None


def _find_and_click_send_button_robustly(page) -> None:
    """Multi-layered strategy to send attachments reliably."""
    _add_system_log("Executing send strategy for attachment...", 'DEBUG')

    time.sleep(random.uniform(1.0, 1.5))
    _add_system_log("Simulated user review complete. Initiating send sequence.", 'DEBUG')

    # --- STRATEGY 1: Target the Caption Input and Press Enter ---
    caption_box_selectors = [
        '//div[@aria-label="Send photo"]//div[@role="textbox"]',
        '//div[@aria-label="Send video"]//div[@role="textbox"]',
        '//div[@aria-label="Send document"]//div[@role="textbox"]',
        '//div[contains(@class, "_amig")]//div[@role="textbox"]',
        '//div[@data-animate-modal-body="1"]//div[@role="textbox"]',
        '//div[contains(@class, "g0rxnol2")]//div[@role="textbox"]',
        '//div[@role="dialog"]//div[@role="textbox"]',
    ]
    for i, selector in enumerate(caption_box_selectors):
        try:
            _add_system_log(
                f"Strategy 1: Attempting to find caption box with selector #{i + 1} and press Enter.",
                'DEBUG'
            )
            locator = page.locator(selector).first
            locator.wait_for(state='visible', timeout=10000)
            locator.press('Enter')
            time.sleep(1.0)
            _add_system_log(
                "Strategy 1 SUCCESS: Attachment sent via Enter key on caption box.", 'DEBUG'
            )
            return
        except Exception:
            _add_system_log(
                f"  - Caption box selector #{i + 1} not found. Trying next...", 'DEBUG'
            )
            continue

    _add_system_log(
        "Strategy 1 FAILED: Could not send via caption box. Proceeding to Strategy 2.", 'WARNING'
    )

    # --- STRATEGY 2: Find and Click Send Button ---
    _add_system_log("Strategy 2: Attempting to find and click the send button.", 'DEBUG')
    button_selectors = [
        '//button[@aria-label="Send"]',
        '//span[@data-icon="wds-ic-send-filled"]/ancestor::button',
        '//div[@role="button" and @aria-label="Send"]',
        '//span[@data-icon="send"]/ancestor::button',
        '//button[.//span[@data-icon="wds-ic-send-filled"]]',
        '//div[@role="button"][.//span[@data-icon="wds-ic-send-filled"]]',
    ]

    for i, selector in enumerate(button_selectors):
        try:
            _add_system_log(f"  - Trying button selector #{i + 1}: {selector}", 'DEBUG')
            locator = page.locator(selector).first
            locator.wait_for(state='visible', timeout=4000)
            locator.click()
            _add_system_log("Strategy 2 SUCCESS: Attachment sent via button click.", 'DEBUG')
            return
        except Exception:
            _add_system_log(f"  - Button selector #{i + 1} failed.", 'DEBUG')
            continue

    # --- STRATEGY 3: Keyboard Shortcut Fallback ---
    _add_system_log("Strategy 3: Attempting keyboard shortcut fallback.", 'DEBUG')
    try:
        preview_dialog = page.locator('//div[@role="dialog"]').first
        if preview_dialog.is_visible():
            preview_dialog.click()
            time.sleep(0.3)
        page.keyboard.press('Enter')
        time.sleep(1.0)
        _add_system_log("Strategy 3: Enter key pressed on preview dialog.", 'DEBUG')
        return
    except Exception as e:
        _add_system_log(f"Strategy 3 failed: {e}", 'DEBUG')

    _add_system_log(
        "FATAL: All sending strategies failed.", 'ERROR'
    )
    raise Exception(
        "FATAL: All sending strategies failed. Could not find or activate the send button or caption box."
    )


def _wait_for_chat_ready(page, timeout: int = 15000):
    """Wait until the main chat input box is visible and interactable.

    Returns the main message box Locator.
    Raises Exception if not found or if invalid number screen is detected.
    """
    main_message_box_xpath = '//footer//div[@role="textbox"]'
    try:
        main_message_box = page.locator(main_message_box_xpath).first
        main_message_box.wait_for(state='visible', timeout=timeout)
        return main_message_box
    except Exception:
        # Check if we hit the "invalid number" screen
        try:
            invalid_number_elem = page.locator(
                '//div[contains(text(), "Phone number shared via url is invalid")]'
            ).first
            if invalid_number_elem.is_visible(timeout=2000):
                # Try to dismiss the popup
                try:
                    ok_btn = page.locator('button:has-text("OK"), div[role="button"]:has-text("OK"), button:has-text("ok")').first
                    if ok_btn.is_visible(timeout=1000):
                        ok_btn.click()
                except:
                    pass
                raise Exception("Invalid phone number - WhatsApp shows number is invalid")
        except Exception:
            pass
        raise Exception("Chat input box not found - page may not have loaded correctly")



def send_whatsapp_message(page, number: str, message: str,
                          file_path: str, send_as_caption: bool, detect_opt_out: bool = False) -> tuple:
    """Send a WhatsApp message (text and/or attachment) to a phone number.

    Args:
        page: Playwright page object for the WhatsApp Web session.
        number: Target phone number.
        message: Text message to send (can be empty if only sending attachment).
        file_path: Path to attachment file (None if no attachment).
        send_as_caption: If True, send attachment with message as caption.
        detect_opt_out: If True, check last incoming message for opt-out keywords.

    Returns:
        Tuple of (success: bool, status_text: str).
    """
    try:
        if not page:
            return False, "Agent browser is not initialized."

        # Check for session expiration
        try:
            if page.locator('div[data-ref] canvas, canvas[aria-label="Scan me!"]').first.is_visible(timeout=1000):
                _add_system_log("Session expired (QR code displayed). Aborting campaign.", 'WARNING')
                return False, "Session expired"
        except:
            pass

        # Try search-based chat opening first to avoid full page reload (stealth)
        chat_opened = _find_and_open_chat_via_search(page, number, log_func=lambda msg: _add_system_log(msg, 'INFO'))
        if chat_opened:
            main_message_box = _wait_for_chat_ready(page, timeout=10000)
        else:
            _add_system_log(f"Direct navigation fallback for {number}.", 'INFO')
            url = f"https://web.whatsapp.com/send?phone={number}"
            page.goto(url, wait_until='domcontentloaded')

            # Random delay to simulate page load review (human inspecting chat)
            main_message_box = _wait_for_chat_ready(page, timeout=45000)

        # Check for opt-out messages
        if detect_opt_out:
            try:
                time.sleep(1.0)
                inbound_msgs = page.locator('.message-in').all()
                if inbound_msgs:
                    last_inbound = inbound_msgs[-1]
                    last_text = last_inbound.inner_text().lower()
                    opt_out_words = ['stop', 'unsubscribe', 'remove', 'exit', 'opt out']
                    if any(w in last_text for w in opt_out_words):
                        _add_system_log(f"Opt-out request detected from {number} ('{last_text.strip()}'). Skipping message.", 'INFO')
                        return False, "Opt-out requested by contact"
            except Exception as e:
                _add_system_log(f"Error checking opt-out: {e}", 'DEBUG')

        # --- ATTACHMENT FLOW ---
        if file_path and os.path.exists(file_path):


            # FLOW 1: Attachment with the message as a caption.
            if send_as_caption and message:
                _add_system_log(
                    "Caption flow: Attaching file first to open preview dialog...", 'DEBUG'
                )
                main_message_box.click(timeout=5000)
                time.sleep(random.uniform(0.3, 0.6))
                _attach_file_reliably(page, file_path)


                try:
                    preview_dialog = page.locator('//div[@role="dialog"]').first
                    preview_dialog.wait_for(state='visible', timeout=10000)
                    _add_system_log("Caption flow: Preview dialog is visible.", 'DEBUG')
                except Exception:
                    _add_system_log(
                        "Caption flow: Preview dialog not detected via role, "
                        "proceeding with timed wait.", 'DEBUG'
                    )

                time.sleep(random.uniform(1.0, 2.0))

                _add_system_log(
                    "Caption flow: Locating caption box in preview dialog...", 'DEBUG'
                )
                caption_box = _find_caption_box(page)

                if caption_box:
                    _add_system_log(
                        "Caption flow: Typing caption into preview dialog caption box.", 'DEBUG'
                    )
                    caption_box.click()
                    time.sleep(random.uniform(0.2, 0.5))
                    _human_like_typing_with_flaws(page, message)
                    time.sleep(random.uniform(0.5, 1.0))
                else:
                    _add_system_log(
                        "Caption flow FAILED: Could not find caption box. "
                        "Falling back to separate messages.", 'WARNING'
                    )
                    page.keyboard.press('Escape')
                    time.sleep(random.uniform(0.5, 1.0))
                    main_message_box = _wait_for_chat_ready(page, timeout=10000)
                    _add_system_log("Fallback: Sending text message separately.", 'DEBUG')
                    main_message_box.click()
                    _human_like_typing_with_flaws(page, message)
                    time.sleep(random.uniform(0.5, 1.0))
                    page.keyboard.press('Enter')
                    _add_system_log(
                        "Fallback: Text message sent. Waiting before sending file...", 'DEBUG'
                    )
                    time.sleep(random.uniform(2.0, 3.0))
                    main_message_box = _wait_for_chat_ready(page, timeout=10000)
                    _attach_file_reliably(page, file_path)

            # FLOW 2: Send text and attachment as two separate messages.
            else:
                if message:
                    _add_system_log("Sending text message separately.", 'DEBUG')
                    main_message_box.click()
                    _human_like_typing_with_flaws(page, message)
                    time.sleep(random.uniform(0.5, 1.0))
                    page.keyboard.press('Enter')
                    _add_system_log(
                        "Text message sent. Waiting before sending file...", 'DEBUG'
                    )
                    time.sleep(random.uniform(2.0, 3.0))
                    main_message_box = _wait_for_chat_ready(page, timeout=10000)

                _add_system_log("Sending attachment without caption...", 'DEBUG')
                _attach_file_reliably(page, file_path)

            # --- ROBUST SENDING LOGIC for attachments ---
            _find_and_click_send_button_robustly(page)

        # --- TEXT-ONLY FLOW ---
        elif message:
            _add_system_log("Sending text-only message...", 'DEBUG')
            main_message_box.click()
            _human_like_typing_with_flaws(page, message)
            # Simulate human review pause before sending
            time.sleep(random.uniform(0.8, 1.8))
            page.keyboard.press('Enter')

        time.sleep(random.uniform(1.0, 1.5))
        return True, "Message Sent"

    except Exception as e:
        if "FATAL: All sending strategies failed" in str(e):
            _add_system_log(
                f"Fatal Error: Could not send attachment to {number}. "
                f"All sending methods failed.", 'ERROR'
            )
            return False, "Fatal: Send button not found."
        if "Invalid phone number" in str(e):
            _add_system_log(
                f"Invalid number: {number}. WhatsApp rejected this number.", 'WARNING'
            )
            return False, "Invalid phone number"
        _add_system_log(f"Timeout or error for number {number}: {e}", 'ERROR')
        return False, f"Error: {str(e)[:100]}"


# =============================================================================
# DEFAULT BROWSER DETECTION
# =============================================================================

def _get_default_browser_channel() -> str:
    """Detect the system's default browser and return the Playwright channel.

    Only supports Chrome and Edge (the two Playwright system-browser channels).
    Raises Exception if no supported default browser is found.

    Returns:
        'chrome' or 'msedge'
    """
    import subprocess
    import sys as _sys

    if _sys.platform == 'win32':
        try:
            import winreg
            with winreg.OpenKey(
                winreg.HKEY_CURRENT_USER,
                r'Software\Microsoft\Windows\Shell\Associations\UrlAssociations\http\UserChoice'
            ) as key:
                prog_id, _ = winreg.QueryValueEx(key, 'ProgId')
                prog_id_lower = prog_id.lower()
                if 'chrome' in prog_id_lower:
                    return 'chrome'
                if 'edge' in prog_id_lower or 'msedge' in prog_id_lower:
                    return 'msedge'
        except Exception:
            pass

        try:
            result = subprocess.run(
                ['cmd', '/c', 'ftype', 'http'],
                capture_output=True, text=True, timeout=5
            )
            out = result.stdout.lower()
            if 'chrome' in out:
                return 'chrome'
            if 'edge' in out:
                return 'msedge'
        except Exception:
            pass

    elif _sys.platform == 'darwin':
        try:
            result = subprocess.run(
                ['defaults', 'read', 'com.apple.LaunchServices',
                 'LSHandlers'],
                capture_output=True, text=True, timeout=5
            )
            out = result.stdout.lower()
            if 'chrome' in out:
                return 'chrome'
            if 'edge' in out or 'microsoft edge' in out:
                return 'msedge'
        except Exception:
            pass

    elif _sys.platform.startswith('linux'):
        try:
            result = subprocess.run(
                ['xdg-settings', 'get', 'default-web-browser'],
                capture_output=True, text=True, timeout=5
            )
            out = result.stdout.lower()
            if 'chrome' in out:
                return 'chrome'
            if 'edge' in out:
                return 'msedge'
        except Exception:
            pass

        try:
            result = subprocess.run(
                ['update-alternatives', '--display', 'x-www-browser'],
                capture_output=True, text=True, timeout=5
            )
            out = result.stdout.lower()
            if 'chrome' in out:
                return 'chrome'
            if 'edge' in out:
                return 'msedge'
        except Exception:
            pass

    raise Exception(
        "Could not detect a supported default browser (Chrome or Edge). "
        "Please install Google Chrome or Microsoft Edge."
    )


# =============================================================================
# ACCOUNT MANAGER (Playwright browser contexts per account)
# =============================================================================

# User-agent string for a standard Chrome on Windows
STEALTH_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/131.0.0.0 Safari/537.36"
)

class AccountManager:
    """Manages Playwright browser instances per WhatsApp account.

    Each account gets its own persistent browser context with isolated
    user_data_dir for session persistence. Uses real Chrome (channel='chrome')
    with comprehensive anti-detection measures.
    """

    _playwright_instance = None
    _accounts: dict = {}       # account_id -> {'context': ..., 'page': ..., 'thread': ...}
    _qr_ready: dict = {}       # account_id -> bool
    _qr_paths: dict = {}       # account_id -> str (file path)
    _lock = threading.Lock()
    _auto_reconnect_done: set = set()  # track which accounts already auto-reconnected

    @classmethod
    def _get_playwright(cls):
        """Get or create the shared Playwright instance."""
        if cls._playwright_instance is None:
            cls._playwright_instance = sync_playwright().start()
            _add_system_log("AccountManager: Playwright instance started.", 'INFO')
        return cls._playwright_instance

    @classmethod
    def start_connection(cls, account_id: int, account_name: str,
                         skip_qr: bool = False) -> None:
        """Launch browser for the account and capture QR code, or reconnect.

        Spawns a background thread that:
        1. Launches a persistent Chromium context using real Chrome
        2. Applies comprehensive anti-detection measures
        3. Navigates to WhatsApp Web
        4. If skip_qr=True, just load the page (session should auto-restore)
        5. Otherwise captures the QR code canvas and polls for login
        6. Updates the account status in the DB
        """
        with cls._lock:
            if account_id in cls._accounts:
                _add_system_log(
                    f"Account {account_id}: Connection already in progress.", 'WARNING'
                )
                return

            cls._qr_ready[account_id] = False
            cls._qr_paths[account_id] = None

        def _connection_thread():
            mode = "reconnecting" if skip_qr else "starting"
            _add_system_log(
                f"Account '{account_name}' (ID={account_id}): "
                f"{mode} browser (headed={not HEADLESS})...",
                'INFO'
            )
            try:
                pw = cls._get_playwright()
                user_data_dir = os.path.join(ACCOUNTS_DATA_DIR, str(account_id))
                os.makedirs(user_data_dir, exist_ok=True)

                # Try to use real Chrome first, fall back to bundled Chromium
                launch_kwargs = {
                    'user_data_dir': user_data_dir,
                    'headless': HEADLESS,
                    'args': [
                        '--no-first-run',
                        '--no-default-browser-check',
                        '--disable-blink-features=AutomationControlled',
                        '--window-size=1280,900',
                        '--disable-features=IsolateOrigins,site-per-process',
                        '--disable-site-isolation-trials',
                        '--disable-infobars',
                        '--disable-dev-shm-usage',
                        '--disable-features=TranslateUI',
                        '--disable-ipc-flooding-protection',
                        '--disable-background-timer-throttling',
                        '--disable-backgrounding-occluded-windows',
                        '--disable-renderer-backgrounding',
                        '--disable-field-trial-config',
                        '--disable-hang-monitor',
                        '--disable-prompt-on-repost',
                        '--disable-sync',
                        '--disable-extensions',
                        '--disable-default-apps',
                        '--disable-component-extensions-with-background-pages',
                        '--disable-client-side-phishing-detection',
                        '--no-pings',
                        
                        '--metrics-recording-only',
                        '--mute-audio',
                        '--no-crash-upload',
                        '--no-report-upload',
                    ],
                    'ignore_default_args': [
                        '--enable-automation',
                        '--disable-component-update',
                        '--no-sandbox',
                    ],

                }

                # Use system default browser — no fallback, no bundled Chromium
                default_channel = _get_default_browser_channel()
                _add_system_log(
                    f"Account {account_id}: Detected default browser: "
                    f"{default_channel}.",
                    'INFO'
                )
                context = pw.chromium.launch_persistent_context(
                    **launch_kwargs,
                    channel=default_channel,
                    viewport={'width': 1280, 'height': 900},
                    user_agent=STEALTH_USER_AGENT,
                )

                page = context.pages[0] if context.pages else context.new_page()

                # Inject anti-detection JavaScript into every new page
                context.add_init_script(ANTI_DETECTION_SCRIPT)

                # Apply playwright-stealth if available (extra layer)
                if STEALTH_AVAILABLE:
                    try:
                        stealth_sync(page)
                        _add_system_log(
                            f"Account {account_id}: playwright-stealth patches applied.",
                            'DEBUG'
                        )
                    except Exception as e:
                        _add_system_log(
                            f"Account {account_id}: stealth_sync failed: {e}", 'WARNING'
                        )

                with cls._lock:
                    cls._accounts[account_id] = {
                        'context': context,
                        'page': page,
                        'thread': threading.current_thread(),
                    }

                _add_system_log(
                    f"Account {account_id}: Navigating to WhatsApp Web...", 'INFO'
                )
                page.goto("https://web.whatsapp.com",
                          wait_until='domcontentloaded', timeout=60000)

                # Random delay to simulate a real user waiting for page load
                time.sleep(random.uniform(2.0, 4.0))

                if skip_qr:
                    # Reconnect mode: just wait for WhatsApp to load from
                    # persisted session. Check if chat list appears.
                    _add_system_log(
                        f"Account {account_id}: Waiting for session to restore...",
                        'INFO'
                    )
                    logged_in = False
                    for i in range(30):  # Wait up to 30 seconds
                        try:
                            chat_list_indicators = [
                                '#pane-side',
                                'div[data-testid="chat-list"]',
                                '//div[@data-testid="chat-list-search"]',
                                '//header[contains(@class, "g0rxnol2")]',
                            ]
                            for indicator in chat_list_indicators:
                                try:
                                    el = page.locator(indicator).first
                                    if el.is_visible(timeout=2000):
                                        logged_in = True
                                        break
                                except Exception:
                                    continue
                            if logged_in:
                                break
                        except Exception:
                            pass
                        time.sleep(1)

                    if logged_in:
                        _add_system_log(
                            f"Account {account_id}: Session restored successfully!",
                            'INFO'
                        )
                        with app.app_context():
                            account = Account.query.get(account_id)
                            if account:
                                account.status = 'Connected'
                                account.session_data = user_data_dir
                                db.session.commit()
                        _add_system_log(
                            f"Account {account_id}: Agent is now ONLINE.",
                            'INFO'
                        )
                        # Mark QR as ready so frontend doesn't wait
                        qr_path = os.path.join(QR_CODES_DIR,
                                                f'{account_id}.png')
                        with cls._lock:
                            cls._qr_ready[account_id] = True
                            cls._qr_paths[account_id] = qr_path
                        return  # No QR needed, session restored
                    else:
                        _add_system_log(
                            f"Account {account_id}: Session expired, "
                            f"showing QR for re-login.", 'WARNING'
                        )
                        # Fall through to QR capture below

                # --- QR Code Capture ---
                _add_system_log(
                    f"Account {account_id}: Waiting for QR code to appear...", 'INFO'
                )
                qr_captured = False
                for attempt in range(60):  # Wait up to 60 seconds
                    try:
                        # Try multiple selectors for the QR code element
                        qr_selectors = [
                            'div[data-ref] canvas',
                            'canvas[aria-label="Scan me!"]',
                            'div[data-testid="qrcode"] canvas',
                            'canvas',
                        ]
                        qr_element = None
                        for sel in qr_selectors:
                            try:
                                el = page.locator(sel).first
                                if el.is_visible(timeout=2000):
                                    qr_element = el
                                    break
                            except Exception:
                                continue

                        if qr_element:
                            qr_path = os.path.join(
                                QR_CODES_DIR, f'{account_id}.png')
                            qr_element.screenshot(path=qr_path)
                            with cls._lock:
                                cls._qr_ready[account_id] = True
                                cls._qr_paths[account_id] = qr_path
                            _add_system_log(
                                f"Account {account_id}: QR code captured at "
                                f"{qr_path}", 'INFO'
                            )
                            qr_captured = True
                            break
                    except Exception as e:
                        _add_system_log(
                            f"Account {account_id}: QR capture attempt "
                            f"{attempt + 1} failed: {e}", 'DEBUG'
                        )
                    time.sleep(1)

                if not qr_captured:
                    # Fallback: screenshot the whole page
                    try:
                        qr_path = os.path.join(
                            QR_CODES_DIR, f'{account_id}.png')
                        page.screenshot(path=qr_path)
                        with cls._lock:
                            cls._qr_ready[account_id] = True
                            cls._qr_paths[account_id] = qr_path
                        _add_system_log(
                            f"Account {account_id}: QR code captured via full "
                            f"page screenshot fallback.", 'WARNING'
                        )
                        qr_captured = True
                    except Exception as e:
                        _add_system_log(
                            f"Account {account_id}: Failed to capture QR: {e}",
                            'ERROR'
                        )

                # --- Poll for successful login ---
                _add_system_log(
                    f"Account {account_id}: Polling for WhatsApp login...",
                    'INFO'
                )
                logged_in = False
                for _ in range(180):  # Wait up to 3 minutes
                    try:
                        # Check for chat list (indicates logged in)
                        chat_list_indicators = [
                            '#pane-side',
                            'div[data-testid="chat-list"]',
                            '//div[@data-testid="chat-list-search"]',
                            '//header[contains(@class, "g0rxnol2")]',
                        ]
                        for indicator in chat_list_indicators:
                            try:
                                el = page.locator(indicator).first
                                if el.is_visible(timeout=2000):
                                    logged_in = True
                                    break
                            except Exception:
                                continue
                        if logged_in:
                            break
                    except Exception:
                        pass
                    time.sleep(1)

                if logged_in:
                    _add_system_log(
                        f"Account {account_id}: WhatsApp Web login successful!",
                        'INFO'
                    )
                    # Update account status in DB
                    with app.app_context():
                        account = Account.query.get(account_id)
                        if account:
                            account.status = 'Connected'
                            account.session_data = user_data_dir
                            db.session.commit()
                    _add_system_log(
                        f"Account {account_id}: Agent is now ONLINE.",
                        'INFO'
                    )
                else:
                    _add_system_log(
                        f"Account {account_id}: Login timed out after 3 min.",
                        'WARNING'
                    )
                    with app.app_context():
                        account = Account.query.get(account_id)
                        if account:
                            account.status = 'Disconnected'
                            db.session.commit()

            except Exception as e:
                _add_system_log(
                    f"Account {account_id}: Connection thread error: {e}", 'ERROR'
                )
                with app.app_context():
                    account = Account.query.get(account_id)
                    if account:
                        account.status = 'Disconnected'
                        account.browser_crashes = (account.browser_crashes or 0) + 1
                        db.session.commit()
                with cls._lock:
                    cls._accounts.pop(account_id, None)
                    cls._qr_ready.pop(account_id, None)
                    cls._qr_paths.pop(account_id, None)

        thread = threading.Thread(target=_connection_thread, daemon=True)
        thread.start()

    @classmethod
    def get_page(cls, account_id: int):
        """Get the Playwright page for an account. Returns None if not connected."""
        with cls._lock:
            acct = cls._accounts.get(account_id)
            if acct:
                return acct.get('page')
        return None

    @classmethod
    def is_qr_ready(cls, account_id: int) -> bool:
        """Check if the QR code has been captured for the account."""
        with cls._lock:
            return cls._qr_ready.get(account_id, False)

    @classmethod
    def get_qr_path(cls, account_id: int) -> str:
        """Get the file path to the captured QR code image."""
        with cls._lock:
            return cls._qr_paths.get(account_id)

    @classmethod
    def is_connected(cls, account_id: int) -> bool:
        """Check if the account has an active browser session."""
        with cls._lock:
            return account_id in cls._accounts

    @classmethod
    def disconnect(cls, account_id: int) -> None:
        """Close the browser context for an account and clean up."""
        with cls._lock:
            acct = cls._accounts.pop(account_id, None)
            cls._qr_ready.pop(account_id, None)
            cls._qr_paths.pop(account_id, None)

        if acct:
            try:
                acct['context'].close()
                _add_system_log(
                    f"Account {account_id}: Browser context closed.", 'INFO'
                )
            except Exception as e:
                _add_system_log(
                    f"Account {account_id}: Error closing context: {e}", 'ERROR'
                )

            # Update DB status
            with app.app_context():
                account = Account.query.get(account_id)
                if account:
                    account.status = 'Disconnected'
                    db.session.commit()

    @classmethod
    def shutdown(cls) -> None:
        """Close all browser contexts and stop Playwright."""
        for account_id in list(cls._accounts.keys()):
            cls.disconnect(account_id)
        if cls._playwright_instance:
            try:
                cls._playwright_instance.stop()
                _add_system_log("AccountManager: Playwright instance stopped.", 'INFO')
            except Exception as e:
                _add_system_log(f"AccountManager: Error stopping Playwright: {e}", 'ERROR')
            cls._playwright_instance = None

    @classmethod
    def get_all_connected_accounts(cls) -> list:
        """Return list of account IDs that currently have active browser sessions."""
        with cls._lock:
            return list(cls._accounts.keys())

    @classmethod
    def auto_reconnect_accounts(cls) -> None:
        """On startup, reconnect accounts that have persisted browser sessions.

        Checks all accounts in DB that have non-null session_data. For each,
        if the user_data_dir exists and contains a valid session, launches
        the browser with skip_qr=True to attempt session restoration.
        """
        with app.app_context():
            accounts = Account.query.filter(
                Account.session_data.isnot(None),
                Account.session_data != '',
            ).all()

            for account in accounts:
                acc_id = account.id
                # Skip if already connected or already attempted
                with cls._lock:
                    if acc_id in cls._accounts or acc_id in cls._auto_reconnect_done:
                        continue
                    cls._auto_reconnect_done.add(acc_id)

                user_data_dir = account.session_data
                if not os.path.isdir(user_data_dir):
                    _add_system_log(
                        f"Account {acc_id}: Session dir not found, "
                        f"skipping auto-reconnect.", 'WARNING'
                    )
                    continue

                # Check if session seems valid (has Preferences file)
                prefs_file = os.path.join(user_data_dir, 'Default', 'Preferences')
                if not os.path.isfile(prefs_file):
                    _add_system_log(
                        f"Account {acc_id}: No Preferences file found, "
                        f"skipping auto-reconnect.", 'WARNING'
                    )
                    continue

                _add_system_log(
                    f"Auto-reconnecting account '{account.name}' (ID={acc_id})...",
                    'INFO'
                )
                cls.start_connection(acc_id, account.name, skip_qr=True)


# =============================================================================
# CAMPAIGN CONTROL STATE (in-memory, per-campaign)
# =============================================================================

campaign_controls: dict = {}  # campaign_id -> {'is_running': bool, 'is_paused': bool}
_campaign_controls_lock = threading.Lock()


def _get_campaign_control(campaign_id: int, default_running: bool = False) -> dict:
    """Get or create control state for a campaign.

    Args:
        campaign_id: The campaign ID.
        default_running: If creating a new control record, use this for is_running.
                         Default changed to False so new campaigns are not treated as
                         already running.
    """
    with _campaign_controls_lock:
        if campaign_id not in campaign_controls:
            campaign_controls[campaign_id] = {'is_running': default_running, 'is_paused': False}
        return campaign_controls[campaign_id]


# =============================================================================
# CAMPAIGN WORKER (runs in background thread)
# =============================================================================

def _check_network_and_wait(page_obj, log_func=None):
    """Detect if WhatsApp Web displays a 'Connecting' or offline banner.

    If present, pauses execution and polls until the connection is restored.
    """
    connecting_selectors = [
        'div[data-testid="connectivity-banner"]',
        'span:has-text("Connecting to WhatsApp")',
        'div:has-text("Connecting to WhatsApp")',
        'div:has-text("Computer not connected")',
        'span:has-text("Computer not connected")',
        'div:has-text("Connecting...")',
        'span:has-text("Connecting...")'
    ]
    was_paused = False
    first_check = True
    while True:
        is_connecting = False
        for sel in connecting_selectors:
            try:
                el = page_obj.locator(sel).first
                if el.is_visible(timeout=200):
                    is_connecting = True
                    break
            except:
                pass
                
        if not is_connecting:
            if was_paused and log_func:
                log_func("Connection restored. Resuming sends.")
            break
            
        was_paused = True
        if first_check:
            if log_func:
                log_func("WhatsApp Web is connecting or offline. Pausing sends until reconnect completes...")
            first_check = False
        time.sleep(2.0)


def _wait_for_send_window_thread(start_str, end_str, campaign_id, control):
    if not start_str or not end_str:
        return
    while True:
        if not control['is_running']:
            return
        now = datetime.now()
        curr_val = now.hour * 60 + now.minute
        try:
            start_h, start_m = map(int, start_str.split(':'))
            end_h, end_m = map(int, end_str.split(':'))
            start_val = start_h * 60 + start_m
            end_val = end_h * 60 + end_m
            
            is_inside = False
            if start_val <= end_val:
                is_inside = start_val <= curr_val <= end_val
            else:
                is_inside = curr_val >= start_val or curr_val <= end_val
                
            if is_inside:
                break
                
            _add_system_log(f"Campaign {campaign_id}: Outside active send window ({start_str} - {end_str}). Waiting...", 'INFO')
        except Exception as e:
            _add_system_log(f"Campaign {campaign_id}: Send window error: {e}", 'WARNING')
            break
            
        for _ in range(60):
            if not control['is_running'] or control['is_paused']:
                return
            time.sleep(0.5)



def campaign_worker(campaign_id: int, account_id: int, contacts: list,
                    message_template: str, attachment_path: str,
                    send_as_caption: bool, placeholders: list,
                    config: dict) -> None:
    """Background worker that sends WhatsApp messages for a campaign.

    Runs in a daemon thread. Updates campaign state in the database
    and creates CampaignLog entries for each message attempt.
    """
    control = _get_campaign_control(campaign_id)
    control['is_running'] = True
    control['is_paused'] = False

    _add_system_log(f"Campaign {campaign_id}: Worker started.", 'INFO')

    page = AccountManager.get_page(account_id)
    if not page:
        _add_system_log(
            f"Campaign {campaign_id}: Account {account_id} browser not available.", 'ERROR'
        )
        with app.app_context():
            camp = Campaign.query.get(campaign_id)
            if camp:
                camp.status = 'Failed'
                db.session.commit()
        control['is_running'] = False
        return

    min_delay = config.get('messageDelayMin', 1)
    max_delay = config.get('messageDelayMax', 2)

    for idx, contact in enumerate(contacts):
        # 1. Check active send window
        send_window_start = config.get('sendWindowStart')
        send_window_end = config.get('sendWindowEnd')
        if send_window_start and send_window_end:
            _wait_for_send_window_thread(send_window_start, send_window_end, campaign_id, control)

        # 1.5 Check network connecting/offline banner
        _check_network_and_wait(page, log_func=lambda msg: _add_system_log(f"Campaign {campaign_id}: {msg}", 'WARNING' if "Pausing" in msg else 'INFO'))

        # 2. Warm-Up Mode check
        if config.get('warmUpMode'):
            with app.app_context():
                account = Account.query.get(account_id)
                if account:
                    days_active = max(0, (datetime.utcnow() - account.created_at).days)
                    daily_limit = min(500, int(20 * (1.10 ** days_active)))
                    # Check how many we sent today
                    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
                    sent_today = CampaignLog.query.join(Campaign).filter(
                        Campaign.account_id == account_id,
                        CampaignLog.status == 'Sent',
                        CampaignLog.timestamp >= today_start
                    ).count()
                    if sent_today >= daily_limit:
                        _add_system_log(f"Campaign {campaign_id}: Warm-Up daily limit reached ({sent_today}/{daily_limit} messages). Pausing campaign.", 'WARNING')
                        control['is_paused'] = True
                        camp = Campaign.query.get(campaign_id)
                        if camp:
                            camp.status = 'Paused'
                            db.session.commit()
                        while sent_today >= daily_limit:
                            if not control['is_running']:
                                break
                            time.sleep(10)
                            today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
                            sent_today = CampaignLog.query.join(Campaign).filter(
                                Campaign.account_id == account_id,
                                CampaignLog.status == 'Sent',
                                CampaignLog.timestamp >= today_start
                            ).count()

        # Check control signals
        if not control['is_running']:
            _add_system_log(
                f"Campaign {campaign_id}: Worker stopping (is_running=False).", 'INFO'
            )
            break

        while control['is_paused']:
            time.sleep(1)
            if not control['is_running']:
                break
        if not control['is_running']:
            break

        # Random idle simulation
        if random.random() < 0.05:
            _simulate_idle_activity(page)

        number = contact.get('number', '')
        final_text = process_message_for_contact(
            message_template, contact, placeholders
        )

        log_preview = (final_text.split('\n')[0][:30] + '...') if final_text else ""
        if attachment_path:
            log_preview = f"[{os.path.basename(attachment_path)}] {log_preview}".strip()

        _add_system_log(
            f"Campaign {campaign_id}: Sending to {number} ({idx + 1}/{len(contacts)})...",
            'INFO'
        )
        success, status_text = send_whatsapp_message(
            page, number, final_text, attachment_path, send_as_caption,
            detect_opt_out=config.get('detectOptOut', False)
        )

        # Update campaign & account in DB
        with app.app_context():
            camp = Campaign.query.get(campaign_id)
            acc = Account.query.get(account_id)
            if camp:
                if success:
                    camp.sent += 1
                    log_status = 'Sent'
                    if acc:
                        acc.successful_sends = (acc.successful_sends or 0) + 1
                else:
                    camp.failed += 1
                    log_status = 'Failed'
                    if acc:
                        if status_text == "Session expired":
                            acc.session_resets = (acc.session_resets or 0) + 1
                        else:
                            acc.failed_sends = (acc.failed_sends or 0) + 1
                db.session.commit()

            # Create campaign log entry
            log_entry = CampaignLog(
                campaign_id=campaign_id,
                number=number,
                status=log_status,
                message_preview=log_preview if success else status_text[:100],
            )
            db.session.add(log_entry)
            db.session.commit()

            # Handle contact unsubscribe if opt-out requested
            if not success and status_text == "Opt-out requested by contact":
                c = Contact.query.filter_by(number=number, user_id=camp.user_id).first()
                if c:
                    c.status = 'Unsubscribed'
                    db.session.commit()

        if success:
            _add_system_log(
                f"Campaign {campaign_id}: SUCCESS to {number}", 'INFO'
            )
        else:
            _add_system_log(
                f"Campaign {campaign_id}: FAILED to {number}: {status_text}", 'WARNING'
            )

        # Handle Session Expiry abort
        if not success and status_text == "Session expired":
            _add_system_log(f"Campaign {campaign_id}: Session expired. Stopping worker.", 'ERROR')
            control['is_running'] = False
            break

        # Delay between messages
        if control['is_running'] and idx < len(contacts) - 1:
            # Check for batch size & delay
            batch_size = config.get('batchSize')
            batch_delay_min = config.get('batchDelayMin')
            batch_delay_max = config.get('batchDelayMax')
            is_batch_cooldown = False
            
            if batch_size and batch_delay_min and batch_delay_max and (idx + 1) % batch_size == 0:
                is_batch_cooldown = True
                batch_delay = random.uniform(batch_delay_min, batch_delay_max)
                _add_system_log(f"Campaign {campaign_id}: Reached batch size {batch_size}. Pausing for batch delay of {batch_delay:.1f}s...", 'INFO')
                total_delay = batch_delay
            else:
                # Periodic Human Break ("Coffee Break") - every 5 to 9 messages
                if (idx + 1) % random.randint(5, 9) == 0:
                    break_duration = random.uniform(15.0, 35.0)
                    _add_system_log(
                        f"Campaign {campaign_id}: Simulating human pause (coffee break) for {break_duration:.1f}s to avoid detection...", 'INFO'
                    )
                    for _ in range(int(break_duration * 2)):
                        if not control['is_running'] or control['is_paused']:
                            break
                        time.sleep(0.5)

                if control['is_running']:
                    # Calculate dynamic message-length and attachment size delay scaling
                    word_count = len(final_text.split()) if final_text else 0
                    file_size_mb = 0
                    if attachment_path and os.path.exists(attachment_path):
                        try:
                            file_size_mb = os.path.getsize(attachment_path) / (1024.0 * 1024.0)
                        except:
                            pass
                    extra_delay = (word_count * 0.08) + (file_size_mb * 1.5)

                    avg_delay = (min_delay + max_delay) / 2
                    std_dev = max((max_delay - min_delay) / 4, 0.1)
                    delay = max(min_delay, random.gauss(avg_delay, std_dev))
                    delay = min(delay, max_delay * 2)
                    total_delay = delay + extra_delay

            # Pacing & Stagger calculations
            pacing_messages_per_hour = config.get('pacingMessagesPerHour')
            stagger_duration_hours = config.get('staggerDurationHours')
            if stagger_duration_hours and not pacing_messages_per_hour:
                pacing_messages_per_hour = max(1, int(len(contacts) / stagger_duration_hours))
            
            if pacing_messages_per_hour and not is_batch_cooldown:
                pacing_interval = 3600.0 / pacing_messages_per_hour
                if total_delay < pacing_interval:
                    total_delay = pacing_interval

            if control['is_running']:
                _add_system_log(
                    f"Campaign {campaign_id}: Cooldown {total_delay:.1f}s...", 'DEBUG'
                )
                for _ in range(int(total_delay * 2)):
                    if not control['is_running'] or control['is_paused']:
                        break
                    time.sleep(0.5)



    # Mark campaign as completed or stopped
    with app.app_context():
        camp = Campaign.query.get(campaign_id)
        if camp:
            if control['is_running']:
                camp.status = 'Completed'
            else:
                camp.status = 'Failed' if camp.sent == 0 else 'Completed'
            db.session.commit()

    control['is_running'] = False
    _add_system_log(
        f"Campaign {campaign_id}: Worker finished. "
        f"Sent={camp.sent if camp else '?'}, Failed={camp.failed if camp else '?'}.",
        'INFO'
    )


# =============================================================================
# API ROUTES - AUTH
# =============================================================================

@app.route('/api/auth/signup', methods=['POST'])
def auth_signup():
    """Register a new user account. Returns JWT token."""
    data = request.get_json(silent=True) or {}
    email = (data.get('email') or '').strip().lower()
    password = data.get('password', '')
    name = (data.get('name') or '').strip()

    if not email or not password or not name:
        return jsonify({
            'status': 'error',
            'message': 'Email, password, and name are required.'
        }), 400

    if len(password) < 6:
        return jsonify({
            'status': 'error',
            'message': 'Password must be at least 6 characters.'
        }), 400

    if User.query.filter_by(email=email).first():
        return jsonify({
            'status': 'error',
            'message': 'An account with this email already exists.'
        }), 409

    user = User(
        email=email,
        password_hash=generate_password_hash(password),
        name=name,
    )
    db.session.add(user)
    db.session.commit()

    token = generate_jwt(user.id)
    _add_system_log(f"User '{email}' signed up (ID={user.id}).", 'INFO')

    return jsonify({
        'status': 'success',
        'token': token,
        'user': user.to_dict(),
    }), 201


@app.route('/api/auth/login', methods=['POST'])
def auth_login():
    """Authenticate a user and return a JWT token."""
    data = request.get_json(silent=True) or {}
    email = (data.get('email') or '').strip().lower()
    password = data.get('password', '')

    if not email or not password:
        return jsonify({
            'status': 'error',
            'message': 'Email and password are required.'
        }), 400

    user = User.query.filter_by(email=email).first()
    if not user or not check_password_hash(user.password_hash, password):
        return jsonify({
            'status': 'error',
            'message': 'Invalid email or password.'
        }), 401

    token = generate_jwt(user.id)

    # Track login history
    if hasattr(user, 'last_login_at'):
        user.last_login_at = datetime.utcnow()
    if hasattr(user, 'login_history_json'):
        try:
            history = json.loads(user.login_history_json) if user.login_history_json else []
        except (json.JSONDecodeError, TypeError):
            history = []
        history.append({
            'timestamp': datetime.utcnow().isoformat(),
            'ip': request.remote_addr or 'unknown',
            'user_agent': request.headers.get('User-Agent', '')[:200],
        })
        if len(history) > 100:
            history = history[-100:]
        user.login_history_json = json.dumps(history)
    db.session.commit()

    _add_system_log(f"User '{email}' logged in.", 'INFO')

    return jsonify({
        'status': 'success',
        'token': token,
        'user': user.to_dict(),
    })


@app.route('/api/auth/forgot-password', methods=['POST'])
def auth_forgot_password():
    """Send a password reset link/token for a user who forgot their password."""
    data = request.get_json(silent=True) or {}
    email = (data.get('email') or '').strip().lower()

    if not email:
        return jsonify({'status': 'error', 'message': 'Email is required.'}), 400

    user = User.query.filter_by(email=email).first()
    if not user:
        # Don't reveal whether the email exists
        return jsonify({
            'status': 'success',
            'message': 'If an account with that email exists, a reset link has been sent.'
        })

    import secrets
    reset_token = secrets.token_urlsafe(32)
    user.reset_token = reset_token
    user.reset_token_expires = datetime.utcnow() + timedelta(hours=1)
    db.session.commit()

    _add_system_log(f"Password reset requested for '{email}'. Token generated.", 'INFO')

    # In production, send email here. For now, return the token directly.
    return jsonify({
        'status': 'success',
        'message': 'Password reset token generated.',
        'reset_token': reset_token,
    })


@app.route('/api/auth/reset-password', methods=['POST'])
def auth_reset_password():
    """Reset password using a valid reset token."""
    data = request.get_json(silent=True) or {}
    token = (data.get('token') or '').strip()
    new_password = data.get('new_password', '')

    if not token or not new_password:
        return jsonify({'status': 'error', 'message': 'Token and new password are required.'}), 400

    if len(new_password) < 6:
        return jsonify({'status': 'error', 'message': 'Password must be at least 6 characters.'}), 400

    user = User.query.filter_by(reset_token=token).first()
    if not user or not user.reset_token_expires or user.reset_token_expires < datetime.utcnow():
        return jsonify({'status': 'error', 'message': 'Invalid or expired reset token.'}), 400

    user.password_hash = generate_password_hash(new_password)
    user.reset_token = None
    user.reset_token_expires = None
    db.session.commit()

    _add_system_log(f"Password reset completed for '{user.email}'.", 'INFO')

    return jsonify({'status': 'success', 'message': 'Password has been reset successfully.'})


@app.route('/api/auth/me', methods=['GET'])
@login_required
def auth_me():
    """Return the currently authenticated user's profile."""
    return jsonify({
        'status': 'success',
        'user': g.current_user.to_dict(),
    })


@app.route('/api/settings', methods=['GET', 'PUT'])
@login_required
def manage_user_settings():
    """Get or update the current user's settings."""
    if request.method == 'GET':
        try:
            settings = json.loads(g.current_user.settings_json) if g.current_user.settings_json else {}
        except Exception:
            settings = {}
        return jsonify({
            'status': 'success',
            'settings': settings
        })
    
    # PUT request
    data = request.get_json(silent=True) or {}
    try:
        settings = json.loads(g.current_user.settings_json) if g.current_user.settings_json else {}
    except Exception:
        settings = {}

    if 'theme' in data:
        settings['theme'] = data['theme']
    if 'palette' in data:
        settings['palette'] = data['palette']
    if 'global_placeholders' in data:
        settings['global_placeholders'] = data['global_placeholders']

    g.current_user.settings_json = json.dumps(settings)
    db.session.commit()

    return jsonify({
        'status': 'success',
        'settings': settings,
        'message': 'Settings saved successfully.'
    })


# =============================================================================
# API ROUTES - ACCOUNTS
# =============================================================================

@app.route('/api/accounts', methods=['GET'])
@login_required
def list_accounts():
    """List all accounts for the authenticated user."""
    accounts = Account.query.filter_by(user_id=g.current_user.id).all()
    return jsonify({
        'status': 'success',
        'accounts': [a.to_dict() for a in accounts],
    })


@app.route('/api/accounts', methods=['POST'])
@login_required
def create_account():
    """Create a new WhatsApp account (optionally initiates QR-based connection)."""
    data = request.get_json(silent=True) or {}
    name = (data.get('name') or '').strip()
    whatsapp_number = (data.get('whatsapp_number') or data.get('number') or '').strip()

    if not name:
        return jsonify({
            'status': 'error',
            'message': 'Account name is required.'
        }), 400

    if not whatsapp_number:
        whatsapp_number = 'pending'

    account = Account(
        user_id=g.current_user.id,
        name=name,
        whatsapp_number=whatsapp_number,
        status='Disconnected',
    )
    db.session.add(account)
    db.session.commit()

    _add_system_log(
        f"Account '{name}' created (ID={account.id}) by user {g.current_user.id}.",
        'INFO'
    )

    return jsonify({
        'status': 'success',
        'account': account.to_dict(),
    }), 201


@app.route('/api/accounts/<int:account_id>', methods=['GET'])
@login_required
def get_account(account_id: int):
    """Get details for a specific account."""
    account = Account.query.filter_by(
        id=account_id, user_id=g.current_user.id
    ).first()
    if not account:
        return jsonify({
            'status': 'error',
            'message': 'Account not found.'
        }), 404

    return jsonify({
        'status': 'success',
        'account': account.to_dict(),
    })


@app.route('/api/accounts/<account_id>', methods=['DELETE'])
@login_required
def delete_account(account_id):
    try:
        account_id = int(account_id)
    except Exception:
        return jsonify({'status': 'error', 'message': 'Invalid account ID.'}), 400
    """Delete an account and disconnect its browser session."""
    account = Account.query.filter_by(
        id=account_id, user_id=g.current_user.id
    ).first()
    if not account:
        return jsonify({
            'status': 'error',
            'message': 'Account not found.'
        }), 404

    AccountManager.disconnect(account_id)
    db.session.delete(account)
    db.session.commit()

    _add_system_log(
        f"Account '{account.name}' (ID={account_id}) deleted.", 'INFO'
    )

    return jsonify({
        'status': 'success',
        'message': 'Account deleted.',
    })


@app.route('/api/accounts/<account_id>/connect', methods=['POST'])
@login_required
def connect_account(account_id):
    try:
        account_id = int(account_id)
    except Exception:
        return jsonify({'status': 'error', 'message': 'Invalid account ID.'}), 400
    account = Account.query.filter_by(
        id=account_id, user_id=g.current_user.id
    ).first()
    if not account:
        return jsonify({
            'status': 'error',
            'message': 'Account not found.'
        }), 404

    if AccountManager.is_connected(account_id):
        return jsonify({
            'status': 'success',
            'message': 'Account already connected or connecting.',
            'already_connected': True,
        }), 200

    AccountManager.start_connection(account_id, account.name)

    return jsonify({
        'status': 'success',
        'message': 'Connection process started. Poll /qr endpoint for the QR code.',
    }), 202


@app.route('/api/accounts/<account_id>/qr', methods=['GET'])
@login_required
def get_account_qr(account_id):
    try:
        account_id = int(account_id)
    except Exception:
        return jsonify({'status': 'error', 'message': 'Invalid account ID.'}), 400
    """Serve the QR code image for an account that is awaiting login.

    Returns the PNG image if the QR code has been captured.
    Returns 404 if the QR code is not yet ready.
    """
    account = Account.query.filter_by(
        id=account_id, user_id=g.current_user.id
    ).first()
    if not account:
        return jsonify({
            'status': 'error',
            'message': 'Account not found.'
        }), 404

    if not AccountManager.is_qr_ready(account_id):
        return jsonify({
            'status': 'error',
            'message': 'QR code not yet available. Please wait.',
            'qr_ready': False,
        }), 404

    qr_path = AccountManager.get_qr_path(account_id)
    if not qr_path or not os.path.exists(qr_path):
        return jsonify({
            'status': 'error',
            'message': 'QR code image not found on disk.',
        }), 404

    from flask import send_file
    return send_file(qr_path, mimetype='image/png')


def _get_local_agent_status():
    """Helper to query the local agent status on port 5001."""
    import requests
    try:
        r = requests.get('http://127.0.0.1:5001/status', timeout=1.0)
        if r.status_code == 200:
            return r.json()
    except Exception:
        pass
    return None


@app.route('/api/accounts/<account_id>/status', methods=['GET'])
@login_required
def get_account_connection_status(account_id):
    try:
        account_id = int(account_id)
    except Exception:
        return jsonify({'status': 'error', 'message': 'Invalid account ID.'}), 400
    """Get the current connection status for an account.

    Returns whether the QR code is ready and whether the account is connected.
    """
    account = Account.query.filter_by(
        id=account_id, user_id=g.current_user.id
    ).first()
    if not account:
        return jsonify({
            'status': 'error',
            'message': 'Account not found.'
        }), 404

    # 1. Check local agent first
    local_status = _get_local_agent_status()
    if local_status and local_status.get("account_id") == str(account_id):
        is_connected = local_status.get("is_connected", False)
        if is_connected:
            if account.status != 'Connected':
                account.status = 'Connected'
                db.session.commit()
            return jsonify({
                'status': 'success',
                'account_status': 'Connected',
                'qr_ready': False,
                'is_connected': True,
            })

    # 2. Fallback to backend in-memory check
    is_connected = AccountManager.is_connected(account_id)
    if is_connected:
        if account.status != 'Connected':
            account.status = 'Connected'
            db.session.commit()
    else:
        if account.status == 'Connected':
            account.status = 'Disconnected'
            db.session.commit()

    return jsonify({
        'status': 'success',
        'account_status': account.status,
        'qr_ready': AccountManager.is_qr_ready(account_id),
        'is_connected': is_connected,
    })


@app.route('/api/accounts/<account_id>/diagnostics', methods=['GET'])
@login_required
def get_account_diagnostics(account_id):
    try:
        account_id = int(account_id)
    except Exception:
        return jsonify({'status': 'error', 'message': 'Invalid account ID.'}), 400
    
    account = Account.query.filter_by(
        id=account_id, user_id=g.current_user.id
    ).first()
    if not account:
        return jsonify({
            'status': 'error',
            'message': 'Account not found.'
        }), 404
        
    return jsonify({
        'status': 'success',
        'diagnostics': {
            'successful_sends': account.successful_sends or 0,
            'failed_sends': account.failed_sends or 0,
            'retry_count': account.retry_count or 0,
            'browser_crashes': account.browser_crashes or 0,
            'session_resets': account.session_resets or 0,
        }
    })




# =============================================================================
# API ROUTES - CAMPAIGNS
# =============================================================================

@app.route('/api/campaigns', methods=['GET'])
@login_required
def list_campaigns():
    """List all campaigns for the authenticated user."""
    campaigns = Campaign.query.filter_by(
        user_id=g.current_user.id
    ).order_by(Campaign.created_at.desc()).all()
    return jsonify({
        'status': 'success',
        'campaigns': [c.to_dict() for c in campaigns],
    })


@app.route('/api/campaigns', methods=['POST'])
@login_required
def create_campaign():
    """Create a new campaign."""
    data = request.get_json(silent=True) or {}
    name = (data.get('name') or '').strip()
    account_id = data.get('account_id') or data.get('accountId')

    if not name:
        return jsonify({
            'status': 'error',
            'message': 'Campaign name is required.'
        }), 400

    if not account_id:
        return jsonify({
            'status': 'error',
            'message': 'Account ID is required.'
        }), 400

    # Verify account belongs to user
    account = Account.query.filter_by(
        id=int(account_id), user_id=g.current_user.id
    ).first()
    if not account:
        return jsonify({
            'status': 'error',
            'message': 'Account not found.'
        }), 404

    config = {}
    for key in ['messageDelayMin', 'messageDelayMax', 'batchSize',
                 'batchDelayMin', 'batchDelayMax', 'simulateTyping',
                 'globalPlaceholders', 'pacingMessagesPerHour',
                 'staggerDurationHours', 'sendWindowStart', 'sendWindowEnd',
                 'warmUpMode', 'detectOptOut', 'targetGroups',
                 'scheduleType', 'scheduledAt', 'timezone',
                 'recurringFrequency', 'recurringDays', 'sendInContactTimezone',
                 'useAttachmentFromFolder']:
        if key in data:
            config[key] = data[key]


    campaign = Campaign(
        user_id=g.current_user.id,
        account_id=int(account_id),
        name=name,
        status='Draft',
        message=data.get('message', ''),
        attachment_path=data.get('attachment_path'),
        send_as_caption=data.get('send_as_caption', data.get('sendAsCaption', False)),
        total=data.get('total', 0),
    )
    campaign.set_config(config)
    db.session.add(campaign)
    db.session.commit()

    _add_system_log(
        f"Campaign '{name}' created (ID={campaign.id}) by user {g.current_user.id}.",
        'INFO'
    )

    return jsonify({
        'status': 'success',
        'campaign': campaign.to_dict(),
    }), 201


@app.route('/api/campaigns/<int:campaign_id>', methods=['GET'])
@login_required
def get_campaign(campaign_id: int):
    """Get details for a specific campaign."""
    campaign = Campaign.query.filter_by(
        id=campaign_id, user_id=g.current_user.id
    ).first()
    if not campaign:
        return jsonify({
            'status': 'error',
            'message': 'Campaign not found.'
        }), 404

    return jsonify({
        'status': 'success',
        'campaign': campaign.to_dict(),
    })


@app.route('/api/campaigns/<int:campaign_id>', methods=['PUT'])
@login_required
def update_campaign(campaign_id: int):
    """Update a campaign's configuration."""
    campaign = Campaign.query.filter_by(
        id=campaign_id, user_id=g.current_user.id
    ).first()
    if not campaign:
        return jsonify({
            'status': 'error',
            'message': 'Campaign not found.'
        }), 404

    data = request.get_json(silent=True) or {}

    if 'name' in data:
        campaign.name = data['name']
    if 'message' in data:
        campaign.message = data['message']
    if 'attachment_path' in data:
        campaign.attachment_path = data['attachment_path']
    if 'send_as_caption' in data:
        campaign.send_as_caption = data['send_as_caption']
    if 'sendAsCaption' in data:
        campaign.send_as_caption = data['sendAsCaption']
    if 'total' in data:
        campaign.total = data['total']
    if 'status' in data:
        campaign.status = data['status']

    # Update config
    config = campaign.get_config()
    for key in ['messageDelayMin', 'messageDelayMax', 'batchSize',
                 'batchDelayMin', 'batchDelayMax', 'simulateTyping',
                 'globalPlaceholders', 'pacingMessagesPerHour',
                 'staggerDurationHours', 'sendWindowStart', 'sendWindowEnd',
                 'warmUpMode', 'detectOptOut', 'targetGroups',
                 'scheduleType', 'scheduledAt', 'timezone',
                 'recurringFrequency', 'recurringDays', 'sendInContactTimezone',
                 'useAttachmentFromFolder']:
        if key in data:
            config[key] = data[key]
    campaign.set_config(config)


    db.session.commit()

    return jsonify({
        'status': 'success',
        'campaign': campaign.to_dict(),
    })


@app.route('/api/campaigns/<int:campaign_id>', methods=['DELETE'])
@login_required
def delete_campaign(campaign_id: int):
    """Delete a campaign and its logs."""
    campaign = Campaign.query.filter_by(
        id=campaign_id, user_id=g.current_user.id
    ).first()
    if not campaign:
        return jsonify({
            'status': 'error',
            'message': 'Campaign not found.'
        }), 404

    # Stop the campaign if running
    control = _get_campaign_control(campaign_id)
    control['is_running'] = False

    db.session.delete(campaign)
    db.session.commit()

    _add_system_log(
        f"Campaign '{campaign.name}' (ID={campaign_id}) deleted.", 'INFO'
    )

    return jsonify({
        'status': 'success',
        'message': 'Campaign deleted.',
    })


@app.route('/api/campaigns/<int:campaign_id>/launch', methods=['POST'])
@login_required
def launch_campaign(campaign_id: int):
    """Launch a campaign, auto-connecting the account if needed, then starting the worker."""
    campaign = Campaign.query.filter_by(
        id=campaign_id, user_id=g.current_user.id
    ).first()
    if not campaign:
        return jsonify({
            'status': 'error',
            'message': 'Campaign not found.'
        }), 404

    control = _get_campaign_control(campaign_id)
    if control.get('is_running'):
        # Force reset any stale running flag from prior server/crash states
        control['is_running'] = False
        control['is_paused'] = False

    data = request.get_json(silent=True) or {}

    # Resolve attachment path
    attachment_path = campaign.attachment_path
    if data.get('useAttachmentFromFolder'):
        found_path, status_msg = _find_attachment_in_shared_folder()
        if not found_path:
            return jsonify({
                'status': 'error',
                'message': f'Attachment error: {status_msg}. '
                           f'Please place a file in your Downloads/Attach folder.'
            }), 400
        attachment_path = found_path
        _add_system_log(
            f"Campaign {campaign_id}: Using attachment from folder: "
            f"{os.path.basename(attachment_path)}", 'INFO'
        )

    # Get contacts from request or from target groups
    contacts = data.get('contacts', [])
    if not contacts and data.get('targetGroups'):
        target_groups = data['targetGroups']
        all_contacts = Contact.query.filter_by(user_id=g.current_user.id).all()
        contacts = [
            c.to_dict() for c in all_contacts
            if any(g in c.get_groups() for g in target_groups)
        ]

    if not contacts:
        return jsonify({
            'status': 'error',
            'message': 'No contacts to send to.'
        }), 400

    account_id = campaign.account_id
    if not account_id:
        return jsonify({
            'status': 'error',
            'message': 'Campaign has no account assigned.'
        }), 400

    # Auto-connect the account if it's not already connected
    if not AccountManager.is_connected(account_id):
        account = Account.query.get(account_id)
        if not account:
            return jsonify({
                'status': 'error',
                'message': 'Account not found.'
            }), 404

        # If the account has never been connected (no session data), the user
        # must connect it manually first via QR code scan
        if not account.session_data:
            return jsonify({
                'status': 'error',
                'message': (
                    f'Account "{account.name}" has never been connected. '
                    f'Please go to the Accounts page and click "Connect via QR" '
                    f'to scan the WhatsApp QR code first. After the initial '
                    f'connection, future campaign launches will auto-connect.'
                )
            }), 400

        _add_system_log(
            f"Campaign {campaign_id}: Account '{account.name}' not connected. "
            f"Auto-connecting now...", 'INFO'
        )
        connected = AccountManager.start_connection(account_id, account.name, skip_qr=True, wait_timeout=60)

        if not connected:
            with app.app_context():
                acc = Account.query.get(account_id)
                if acc:
                    acc.last_error = 'Auto-connect failed: session expired or not restored within 60 seconds.'
                    acc.status = 'Disconnected'
                    db.session.commit()
            _add_system_log(
                f"Campaign {campaign_id}: Account '{account.name}' failed to auto-connect. "
                f"Relaunch will trigger reconnect.",
                'WARNING'
            )
            return jsonify({
                'status': 'reconnect_required',
                'account_id': account_id,
                'message': (
                    f'Account "{account.name}" failed to auto-connect within '
                    f'60 seconds. The WhatsApp session may have expired. Please '
                    f're-connect via the Accounts page (Connect via QR) first.'
                )
            }), 428

        _add_system_log(
            f"Campaign {campaign_id}: Account '{account.name}' connected.", 'INFO'
        )

    # Get config
    config = campaign.get_config()
    if 'messageDelayMin' in data:
        config['messageDelayMin'] = data['messageDelayMin']
    if 'messageDelayMax' in data:
        config['messageDelayMax'] = data['messageDelayMax']
    if 'globalPlaceholders' in data:
        config['globalPlaceholders'] = data['globalPlaceholders']

    placeholders = config.get('globalPlaceholders', [])
    message_template = data.get('message', campaign.message or '')
    send_as_caption = data.get('sendAsCaption', campaign.send_as_caption)

    # Update campaign in DB
    campaign.status = 'Running'
    campaign.total = len(contacts)
    campaign.sent = 0
    campaign.failed = 0
    campaign.message = message_template
    campaign.attachment_path = attachment_path
    campaign.send_as_caption = send_as_caption
    campaign.set_config(config)
    
    # Clear old logs for this campaign
    CampaignLog.query.filter_by(campaign_id=campaign_id).delete()
    db.session.commit()

    if data.get("local_agent"):
        _add_system_log(
            f"Campaign '{campaign.name}' (ID={campaign_id}) launched via local agent.", 'INFO'
        )
        return jsonify({
            'status': 'success',
            'message': 'Campaign status updated to Running (local agent active).',
            'campaign': campaign.to_dict(),
        })

    # Start worker thread
    control = _get_campaign_control(campaign_id)
    control['is_running'] = True
    thread = threading.Thread(
        target=campaign_worker,
        args=(
            campaign_id,
            campaign.account_id,
            contacts,
            message_template,
            attachment_path,
            send_as_caption,
            placeholders,
            config,
        ),
        daemon=True,
    )
    thread.start()

    _add_system_log(
        f"Campaign '{campaign.name}' (ID={campaign_id}) launched with "
        f"{len(contacts)} contacts.", 'INFO'
    )

    return jsonify({
        'status': 'success',
        'message': 'Campaign launched.',
        'campaign': campaign.to_dict(),
    })


@app.route('/api/campaigns/<int:campaign_id>/control', methods=['POST'])
@login_required
def control_campaign(campaign_id: int):
    """Pause, resume, or stop a running campaign."""
    campaign = Campaign.query.filter_by(
        id=campaign_id, user_id=g.current_user.id
    ).first()
    if not campaign:
        return jsonify({
            'status': 'error',
            'message': 'Campaign not found.'
        }), 404

    data = request.get_json(silent=True) or {}
    action = data.get('action', '').lower()

    control = _get_campaign_control(campaign_id)

    if action == 'pause':
        if not control.get('is_running'):
            return jsonify({
                'status': 'error',
                'message': 'No campaign running to pause.'
            }), 400
        control['is_paused'] = True
        campaign.status = 'Paused'
        db.session.commit()
        msg = 'Campaign paused.'
        _add_system_log(f"Campaign {campaign_id}: Paused by user.", 'INFO')

    elif action == 'resume':
        if not control.get('is_running'):
            return jsonify({
                'status': 'error',
                'message': 'No campaign running to resume.'
            }), 400
        control['is_paused'] = False
        campaign.status = 'Running'
        db.session.commit()
        msg = 'Campaign resumed.'
        _add_system_log(f"Campaign {campaign_id}: Resumed by user.", 'INFO')

    elif action == 'stop':
        if not control.get('is_running'):
            return jsonify({
                'status': 'error',
                'message': 'No campaign running to stop.'
            }), 400
        control['is_running'] = False
        control['is_paused'] = False
        campaign.status = 'Completed'
        db.session.commit()
        msg = 'Campaign stopped.'
        _add_system_log(f"Campaign {campaign_id}: Stopped by user.", 'INFO')

    else:
        return jsonify({
            'status': 'error',
            'message': f'Invalid action: {action}. Use pause, resume, or stop.'
        }), 400

    return jsonify({
        'status': 'success',
        'message': msg,
    })


@app.route('/api/campaigns/<int:campaign_id>/logs', methods=['GET'])
@login_required
def get_campaign_logs(campaign_id: int):
    """Get the logs for a specific campaign."""
    campaign = Campaign.query.filter_by(
        id=campaign_id, user_id=g.current_user.id
    ).first()
    if not campaign:
        return jsonify({
            'status': 'error',
            'message': 'Campaign not found.'
        }), 404

    logs = CampaignLog.query.filter_by(campaign_id=campaign_id)\
        .order_by(CampaignLog.timestamp.desc()).limit(200).all()

    return jsonify({
        'status': 'success',
        'logs': [log.to_dict() for log in logs],
    })


@app.route('/api/campaigns/<int:campaign_id>/logs', methods=['DELETE'])
@login_required
def clear_campaign_logs(campaign_id: int):
    """Clear the logs for a specific campaign and reset counts."""
    campaign = Campaign.query.filter_by(
        id=campaign_id, user_id=g.current_user.id
    ).first()
    if not campaign:
        return jsonify({
            'status': 'error',
            'message': 'Campaign not found.'
        }), 404

    # Delete in database
    CampaignLog.query.filter_by(campaign_id=campaign_id).delete()
    campaign.sent = 0
    campaign.failed = 0
    db.session.commit()

    # Forward clear request to local agent if online
    try:
        import requests
        requests.post('http://127.0.0.1:5001/clear-logs', json={'campaign_id': campaign_id}, timeout=1.0)
    except Exception:
        pass

    return jsonify({
        'status': 'success',
        'message': 'Campaign logs cleared and progress reset.'
    })


# =============================================================================
# API ROUTES - CONTACTS
# =============================================================================

@app.route('/api/contacts', methods=['GET'])
@login_required
def list_contacts():
    """List all contacts for the authenticated user."""
    contacts = Contact.query.filter_by(user_id=g.current_user.id).all()
    return jsonify({
        'status': 'success',
        'contacts': [c.to_dict() for c in contacts],
    })


@app.route('/api/contacts', methods=['POST'])
@login_required
def create_contact():
    """Create a new contact."""
    data = request.get_json(silent=True) or {}
    number = (data.get('number') or '').strip()
    first_name = (data.get('firstName') or data.get('first_name') or '').strip()
    last_name = (data.get('lastName') or data.get('last_name') or '').strip()
    status = data.get('status', 'Active')
    groups = data.get('groups', [])

    if not number:
        return jsonify({
            'status': 'error',
            'message': 'Phone number is required.'
        }), 400

    contact = Contact(
        user_id=g.current_user.id,
        number=number,
        first_name=first_name,
        last_name=last_name,
        status=status,
    )
    contact.set_groups(groups)
    db.session.add(contact)
    db.session.commit()

    return jsonify({
        'status': 'success',
        'contact': contact.to_dict(),
    }), 201


@app.route('/api/contacts/bulk', methods=['POST'])
@login_required
def bulk_create_contacts():
    """Create multiple contacts at once."""
    data = request.get_json(silent=True) or {}
    contacts_data = data.get('contacts', [])

    if not contacts_data:
        return jsonify({
            'status': 'error',
            'message': 'No contacts provided.'
        }), 400

    created = []
    for cdata in contacts_data:
        number = (cdata.get('number') or '').strip()
        if not number:
            continue
        contact = Contact(
            user_id=g.current_user.id,
            number=number,
            first_name=(cdata.get('firstName') or cdata.get('first_name') or '').strip(),
            last_name=(cdata.get('lastName') or cdata.get('last_name') or '').strip(),
            status=cdata.get('status', 'Active'),
        )
        contact.set_groups(cdata.get('groups', []))
        db.session.add(contact)
        created.append(contact)

    db.session.commit()

    return jsonify({
        'status': 'success',
        'contacts': [c.to_dict() for c in created],
        'count': len(created),
    }), 201


@app.route('/api/contacts/<int:contact_id>', methods=['PUT'])
@login_required
def update_contact(contact_id: int):
    """Update a contact's information."""
    contact = Contact.query.filter_by(
        id=contact_id, user_id=g.current_user.id
    ).first()
    if not contact:
        return jsonify({
            'status': 'error',
            'message': 'Contact not found.'
        }), 404

    data = request.get_json(silent=True) or {}

    if 'number' in data:
        contact.number = data['number']
    if 'firstName' in data:
        contact.first_name = data['firstName']
    if 'first_name' in data:
        contact.first_name = data['first_name']
    if 'lastName' in data:
        contact.last_name = data['lastName']
    if 'last_name' in data:
        contact.last_name = data['last_name']
    if 'status' in data:
        contact.status = data['status']
    if 'groups' in data:
        contact.set_groups(data['groups'])

    db.session.commit()

    return jsonify({
        'status': 'success',
        'contact': contact.to_dict(),
    })


@app.route('/api/contacts/<int:contact_id>', methods=['DELETE'])
@login_required
def delete_contact(contact_id: int):
    """Delete a contact."""
    contact = Contact.query.filter_by(
        id=contact_id, user_id=g.current_user.id
    ).first()
    if not contact:
        return jsonify({
            'status': 'error',
            'message': 'Contact not found.'
        }), 404

    db.session.delete(contact)
    db.session.commit()

    return jsonify({
        'status': 'success',
        'message': 'Contact deleted.',
    })


# =============================================================================
# API ROUTES - GROUPS
# =============================================================================

@app.route('/api/groups', methods=['GET'])
@login_required
def list_groups():
    """List all groups for the authenticated user."""
    groups = Group.query.filter_by(user_id=g.current_user.id).all()
    if not groups:
        default_group = Group(user_id=g.current_user.id, name='General')
        db.session.add(default_group)
        db.session.commit()
        groups = [default_group]
    return jsonify({
        'status': 'success',
        'groups': [g.to_dict() for g in groups],
    })


@app.route('/api/groups', methods=['POST'])
@login_required
def create_group():
    """Create a new group."""
    data = request.get_json(silent=True) or {}
    name = (data.get('name') or '').strip()

    if not name:
        return jsonify({
            'status': 'error',
            'message': 'Group name is required.'
        }), 400

    group = Group(
        user_id=g.current_user.id,
        name=name,
    )
    db.session.add(group)
    db.session.commit()

    return jsonify({
        'status': 'success',
        'group': group.to_dict(),
    }), 201


@app.route('/api/groups/<int:group_id>', methods=['DELETE'])
@login_required
def delete_group(group_id: int):
    """Delete a group."""
    group = Group.query.filter_by(
        id=group_id, user_id=g.current_user.id
    ).first()
    if not group:
        return jsonify({
            'status': 'error',
            'message': 'Group not found.'
        }), 404

    db.session.delete(group)
    db.session.commit()

    return jsonify({
        'status': 'success',
        'message': 'Group deleted.',
    })


# =============================================================================
# API ROUTES - UTILITIES
# =============================================================================

@app.route('/api/attachment-filename', methods=['GET'])
@login_required
def get_attachment_filename():
    """Get the filename of the first file in the shared Downloads/Attach folder."""
    file_path, status_msg = _find_attachment_in_shared_folder()
    if file_path:
        return jsonify({
            'status': 'success',
            'filename': os.path.basename(file_path),
        })
    else:
        return jsonify({
            'status': 'error',
            'filename': None,
            'message': status_msg,
        })


@app.route('/api/upload-attachment', methods=['POST'])
@login_required
def upload_attachment():
    """Upload an attachment file for use in campaigns."""
    if 'file' not in request.files:
        return jsonify({
            'status': 'error',
            'message': 'No file provided.'
        }), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({
            'status': 'error',
            'message': 'No file selected.'
        }), 400

    # Generate unique filename
    ext = os.path.splitext(file.filename)[1]
    unique_name = f"{int(time.time() * 1000)}_{file.filename}"
    file_path = os.path.join(UPLOADS_DIR, unique_name)
    file.save(file_path)

    _add_system_log(f"File uploaded: {unique_name}", 'INFO')

    return jsonify({
        'status': 'success',
        'filename': unique_name,
        'path': file_path,
    })


@app.route('/api/system-logs', methods=['GET'])
@login_required
def get_system_logs():
    """Get recent system logs."""
    with _system_logs_lock:
        logs = list(_system_logs[:100])
    return jsonify({
        'status': 'success',
        'logs': logs,
    })


@app.route('/api/status', methods=['GET', 'POST'])
@login_required
def get_status():
    """Get overall agent status for the authenticated user.

    Checks BOTH the database Account.status AND the in-memory
    AccountManager._accounts dict. The agent is "Online" if at least
    one account has an active browser session (in-memory is definitive).

    Also returns running campaign progress, system logs, and campaign logs
    so the frontend can display real-time status without needing a separate
    agent process on port 5001.
    """
    accounts = Account.query.filter_by(user_id=g.current_user.id).all()

    # Query local agent status
    local_status = None
    if request.method == 'POST':
        local_status = request.json
    else:
        local_status = _get_local_agent_status()
    local_connected_id = None
    if local_status and local_status.get("is_connected"):
        local_connected_id = local_status.get("account_id")

    in_memory_connected = set(AccountManager.get_all_connected_accounts())

    connected_count = 0
    for a in accounts:
        # Connected if either in backend memory or active on local agent
        if a.id in in_memory_connected or (local_connected_id and str(a.id) == str(local_connected_id)):
            connected_count += 1
            if a.status != 'Connected':
                a.status = 'Connected'
                db.session.commit()
        else:
            if a.status == 'Connected':
                a.status = 'Disconnected'
                db.session.commit()

    # --- [SYNC LOCAL AGENT CAMPAIGN STATUS] ---
    local_campaign_id = None
    if local_status and local_status.get("campaign_id"):
        try:
            local_campaign_id = int(local_status.get("campaign_id"))
        except Exception:
            pass

    # Find the user's running/paused campaign (if any)
    running_campaign = None
    if local_campaign_id:
        running_campaign = Campaign.query.filter_by(
            id=local_campaign_id, user_id=g.current_user.id
        ).first()

    if not running_campaign:
        running_campaign = Campaign.query.filter_by(
            user_id=g.current_user.id
        ).filter(
            Campaign.status.in_(['Running', 'Paused'])
        ).order_by(Campaign.id.desc()).first()

    # If the local agent is online and reports a campaign matching the DB campaign:
    if local_status and running_campaign and local_campaign_id == running_campaign.id:
        local_is_running = local_status.get("is_running", False)
        local_is_paused = local_status.get("is_paused", False)
        
        # 1. Update Database Status of the campaign
        if local_is_running:
            # Enforce warm-up limits from the backend if active
            config = running_campaign.get_config()
            if config.get('warmUpMode') and not local_is_paused:
                account = Account.query.get(running_campaign.account_id)
                if account:
                    days_active = max(0, (datetime.utcnow() - account.created_at).days)
                    daily_limit = min(500, int(20 * (1.10 ** days_active)))
                    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
                    sent_today = CampaignLog.query.join(Campaign).filter(
                        Campaign.account_id == running_campaign.account_id,
                        CampaignLog.status == 'Sent',
                        CampaignLog.timestamp >= today_start
                    ).count()
                    if sent_today >= daily_limit:
                        _add_system_log(f"Campaign {running_campaign.id} (Local Agent): Warm-Up limit reached ({sent_today}/{daily_limit}). Sending pause command.", 'WARNING')
                        try:
                            requests.post('http://127.0.0.1:5001/control-campaign', json={'action': 'pause'}, timeout=1.0)
                        except:
                            pass
                        local_is_paused = True

            new_status = 'Paused' if local_is_paused else 'Running'
            if running_campaign.status != new_status:
                running_campaign.status = new_status
                db.session.commit()
        else:
            # Local agent reports it's not running anymore.
            # If the database still has it as Running or Paused, it completed!
            if running_campaign.status in ['Running', 'Paused']:
                running_campaign.status = 'Completed'
                db.session.commit()
                _add_system_log(
                    f"Campaign '{running_campaign.name}' (ID={running_campaign.id}) completed successfully.",
                    'INFO'
                )

        # 2. Update Database counts
        local_sent = local_status.get("sent_count", 0)
        local_failed = local_status.get("failed_count", 0)
        local_total = local_status.get("total_contacts", 0)
        
        if running_campaign.sent != local_sent or running_campaign.failed != local_failed or running_campaign.total != local_total:
            running_campaign.sent = local_sent
            running_campaign.failed = local_failed
            if local_total > 0:
                running_campaign.total = local_total
            db.session.commit()

        # 3. Import new campaign logs from local agent to DB
        local_logs = local_status.get("campaign_logs", [])
        db_log_count = CampaignLog.query.filter_by(campaign_id=running_campaign.id).count()
        if len(local_logs) > db_log_count:
            num_new = len(local_logs) - db_log_count
            new_logs = local_logs[:num_new]
            new_logs.reverse() # oldest new log first
            acc = Account.query.get(running_campaign.account_id)
            for log in new_logs:
                # Add to DB
                log_entry = CampaignLog(
                    campaign_id=running_campaign.id,
                    number=log.get("number", ""),
                    status=log.get("status", "Sent"),
                    message_preview=log.get("message_preview", "")
                )
                db.session.add(log_entry)
                
                # Update account metrics
                if acc:
                    if log.get("status") == "Sent":
                        acc.successful_sends = (acc.successful_sends or 0) + 1
                    else:
                        if "Session expired" in log.get("message_preview", ""):
                            acc.session_resets = (acc.session_resets or 0) + 1
                            acc.status = 'Disconnected'
                        else:
                            acc.failed_sends = (acc.failed_sends or 0) + 1
                
                # Check if this was an opt-out event and update contact in DB
                if log.get("status") == "Failed" and "Opt-out" in log.get("message_preview", ""):
                    c = Contact.query.filter_by(number=log.get("number", ""), user_id=running_campaign.user_id).first()
                    if c:
                        c.status = 'Unsubscribed'
            db.session.commit()


    running_campaigns_count = 0
    campaign_id = None
    is_running = False
    is_paused = False
    sent_count = 0
    failed_count = 0
    campaign_logs_list = []

    if running_campaign:
        running_campaigns_count = 1
        campaign_id = running_campaign.id
        
        # If it's the local agent campaign and local agent is online:
        if local_status and local_campaign_id == running_campaign.id:
            is_running = local_status.get("is_running", False)
            is_paused = local_status.get("is_paused", False)
            sent_count = local_status.get("sent_count", 0)
            failed_count = local_status.get("failed_count", 0)
        else:
            control = campaign_controls.get(campaign_id, {})
            is_running = control.get('is_running', False)
            is_paused = control.get('is_paused', False)
            sent_count = running_campaign.sent or 0
            failed_count = running_campaign.failed or 0

        # Get recent campaign logs from DB
        recent_logs = CampaignLog.query.filter_by(
            campaign_id=campaign_id
        ).order_by(CampaignLog.timestamp.desc()).limit(50).all()
        campaign_logs_list = [log.to_dict() for log in reversed(recent_logs)]

    agent_status = 'Offline'
    if local_status is not None:
        if local_status.get('is_running') or (running_campaigns_count > 0 and is_running):
            agent_status = 'Busy'
        else:
            agent_status = 'Online'
    elif connected_count > 0:
        if running_campaigns_count > 0 and is_running:
            agent_status = 'Busy'
        else:
            agent_status = 'Online'

    # Format system logs as strings the frontend expects: "[HH:MM:SS] message"
    with _system_logs_lock:
        raw_logs = list(_system_logs[:100])
    system_log_strings = [
        f"[{entry['timestamp']}] {entry['message']}"
        for entry in reversed(raw_logs)
    ]

    return jsonify({
        'status': 'success',
        'agent_status': agent_status,
        'connected_accounts': connected_count,
        'total_accounts': len(accounts),
        'running_campaigns': running_campaigns_count,
        'is_running': is_running,
        'is_paused': is_paused,
        'campaign_id': campaign_id,
        'sent_count': sent_count,
        'failed_count': failed_count,
        'system_logs': system_log_strings,
        'campaign_logs': campaign_logs_list,
        'is_connected': local_status.get("is_connected", False) if local_status else False,
        'account_id': local_connected_id,
    })


# =============================================================================
# API ROUTES - ADMIN PANEL
# =============================================================================

# --- Admin Dashboard Stats ---

@app.route('/api/admin/stats', methods=['GET'])
@login_required
@admin_required()
def admin_stats():
    """Get comprehensive admin dashboard statistics."""
    now = datetime.utcnow()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = now - timedelta(days=7)
    month_start = now - timedelta(days=30)
    day_ago = now - timedelta(hours=24)
    hour_ago = now - timedelta(hours=1)

    total_users = User.query.count()
    active_users = User.query.filter(
        User.last_login_at >= hour_ago
    ).count() if hasattr(User, 'last_login_at') else 0

    daily_active = User.query.filter(
        User.last_login_at >= day_ago
    ).count() if hasattr(User, 'last_login_at') else 0

    weekly_active = User.query.filter(
        User.last_login_at >= week_start
    ).count() if hasattr(User, 'last_login_at') else 0

    monthly_active = User.query.filter(
        User.last_login_at >= month_start
    ).count() if hasattr(User, 'last_login_at') else 0

    inactive_users = User.query.filter(
        (User.last_login_at < month_start) | (User.last_login_at == None)
    ).count() if hasattr(User, 'last_login_at') else 0

    new_today = User.query.filter(User.created_at >= today_start).count()
    new_this_week = User.query.filter(User.created_at >= week_start).count()

    total_errors = ErrorLog.query.count()
    unresolved_errors = ErrorLog.query.filter_by(resolved=False).count()
    critical_errors = ErrorLog.query.filter_by(level='CRITICAL', resolved=False).count()
    errors_today = ErrorLog.query.filter(ErrorLog.timestamp >= today_start).count()

    total_campaigns = Campaign.query.count()
    running_campaigns = Campaign.query.filter_by(status='Running').count()
    completed_campaigns = Campaign.query.filter_by(status='Completed').count()

    total_accounts = Account.query.count()
    connected_accounts = Account.query.filter_by(status='Connected').count()

    daily_registrations = []
    for i in range(6, -1, -1):
        day = now - timedelta(days=i)
        day_start = day.replace(hour=0, minute=0, second=0, microsecond=0)
        day_end = day_start + timedelta(days=1)
        count = User.query.filter(
            User.created_at >= day_start,
            User.created_at < day_end
        ).count()
        daily_registrations.append({'date': day_start.strftime('%Y-%m-%d'), 'count': count})

    daily_errors = []
    for i in range(6, -1, -1):
        day = now - timedelta(days=i)
        day_start = day.replace(hour=0, minute=0, second=0, microsecond=0)
        day_end = day_start + timedelta(days=1)
        count = ErrorLog.query.filter(
            ErrorLog.timestamp >= day_start,
            ErrorLog.timestamp < day_end
        ).count()
        daily_errors.append({'date': day_start.strftime('%Y-%m-%d'), 'count': count})

    import psutil
    cpu_percent = psutil.cpu_percent(interval=0.5)
    memory = psutil.virtual_memory()
    disk = psutil.disk_usage('/')

    return jsonify({
        'status': 'success',
        'stats': {
            'users': {
                'total': total_users,
                'active_now': active_users,
                'daily_active': daily_active,
                'weekly_active': weekly_active,
                'monthly_active': monthly_active,
                'inactive': inactive_users,
                'new_today': new_today,
                'new_this_week': new_this_week,
            },
            'errors': {
                'total': total_errors,
                'unresolved': unresolved_errors,
                'critical': critical_errors,
                'today': errors_today,
            },
            'campaigns': {'total': total_campaigns, 'running': running_campaigns, 'completed': completed_campaigns},
            'accounts': {'total': total_accounts, 'connected': connected_accounts},
            'trends': {'registrations': daily_registrations, 'errors': daily_errors},
            'server': {
                'cpu_percent': cpu_percent,
                'memory_percent': memory.percent,
                'memory_used_gb': round(memory.used / (1024**3), 2),
                'memory_total_gb': round(memory.total / (1024**3), 2),
                'disk_percent': disk.percent,
                'disk_used_gb': round(disk.used / (1024**3), 2),
                'disk_total_gb': round(disk.total / (1024**3), 2),
            },
        },
    })


# --- User Management ---

@app.route('/api/admin/users', methods=['GET'])
@login_required
@admin_required()
def admin_list_users():
    """List all users with search, filter, sort, and pagination."""
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 20, type=int)
    search = request.args.get('search', '').strip()
    sort_by = request.args.get('sort_by', 'created_at')
    sort_order = request.args.get('sort_order', 'desc')
    status_filter = request.args.get('status', '')
    role_filter = request.args.get('role', '')

    query = User.query
    if search:
        query = query.filter((User.email.ilike(f'%{search}%')) | (User.name.ilike(f'%{search}%')))
    if status_filter and hasattr(User, 'account_status'):
        query = query.filter(User.account_status == status_filter)
    if role_filter and hasattr(User, 'role'):
        query = query.filter(User.role == role_filter)

    sort_column = getattr(User, sort_by, User.created_at)
    if sort_order == 'asc':
        query = query.order_by(sort_column.asc())
    else:
        query = query.order_by(sort_column.desc())

    total = query.count()
    users = query.offset((page - 1) * per_page).limit(per_page).all()

    return jsonify({
        'status': 'success',
        'users': [{
            **u.to_dict(),
            'role': getattr(u, 'role', 'user'),
            'account_status': getattr(u, 'account_status', 'active'),
            'last_login_at': u.last_login_at.isoformat() if getattr(u, 'last_login_at', None) else None,
        } for u in users],
        'total': total,
        'page': page,
        'per_page': per_page,
        'total_pages': (total + per_page - 1) // per_page,
    })


@app.route('/api/admin/users/<int:user_id>', methods=['GET'])
@login_required
@admin_required()
def admin_get_user(user_id: int):
    """Get detailed user profile including login history."""
    user = User.query.get(user_id)
    if not user:
        return jsonify({'status': 'error', 'message': 'User not found.'}), 404

    login_history = []
    if hasattr(user, 'login_history_json') and user.login_history_json:
        try:
            login_history = json.loads(user.login_history_json)
        except (json.JSONDecodeError, TypeError):
            login_history = []

    return jsonify({
        'status': 'success',
        'user': {
            **user.to_dict(),
            'role': getattr(user, 'role', 'user'),
            'account_status': getattr(user, 'account_status', 'active'),
            'last_login_at': user.last_login_at.isoformat() if getattr(user, 'last_login_at', None) else None,
            'login_history': login_history,
        },
    })


@app.route('/api/admin/users', methods=['POST'])
@login_required
@admin_required(['super_admin', 'admin'])
def admin_create_user():
    """Create a new user account from the admin panel."""
    data = request.get_json(silent=True) or {}
    email = (data.get('email') or '').strip().lower()
    password = data.get('password', '')
    name = (data.get('name') or '').strip()
    role = data.get('role', 'user')
    account_status = data.get('account_status', 'active')

    if not email or not password or not name:
        return jsonify({'status': 'error', 'message': 'Email, password, and name are required.'}), 400
    if len(password) < 6:
        return jsonify({'status': 'error', 'message': 'Password must be at least 6 characters.'}), 400
    if User.query.filter_by(email=email).first():
        return jsonify({'status': 'error', 'message': 'An account with this email already exists.'}), 409

    user = User(email=email, password_hash=generate_password_hash(password), name=name)
    if hasattr(user, 'role'):
        user.role = role
    if hasattr(user, 'account_status'):
        user.account_status = account_status

    db.session.add(user)
    db.session.commit()

    log_audit(g.current_user.id, 'user_created', 'user', user.id,
              {'email': email, 'name': name, 'role': role})
    _add_system_log(f"Admin {g.current_user.email} created user '{email}'.", 'INFO')

    return jsonify({
        'status': 'success',
        'user': {**user.to_dict(), 'role': getattr(user, 'role', 'user'),
                 'account_status': getattr(user, 'account_status', 'active')},
    }), 201


@app.route('/api/admin/users/<int:user_id>', methods=['PUT'])
@login_required
@admin_required(['super_admin', 'admin'])
def admin_update_user(user_id: int):
    """Update user profile, role, or status."""
    user = User.query.get(user_id)
    if not user:
        return jsonify({'status': 'error', 'message': 'User not found.'}), 404

    data = request.get_json(silent=True) or {}
    if 'name' in data:
        user.name = data['name']
    if 'email' in data:
        new_email = data['email'].strip().lower()
        existing = User.query.filter(User.email == new_email, User.id != user_id).first()
        if existing:
            return jsonify({'status': 'error', 'message': 'Email already in use.'}), 409
        user.email = new_email
    if 'role' in data and hasattr(user, 'role'):
        user.role = data['role']
    if 'account_status' in data and hasattr(user, 'account_status'):
        user.account_status = data['account_status']
    if 'plan' in data:
        user.plan = data['plan']

    db.session.commit()
    log_audit(g.current_user.id, 'user_updated', 'user', user_id, details=data)

    return jsonify({
        'status': 'success',
        'user': {**user.to_dict(), 'role': getattr(user, 'role', 'user'),
                 'account_status': getattr(user, 'account_status', 'active')},
    })


@app.route('/api/admin/users/<int:user_id>', methods=['DELETE'])
@login_required
@admin_required(['super_admin'])
def admin_delete_user(user_id: int):
    """Permanently delete a user and all associated data."""
    user = User.query.get(user_id)
    if not user:
        return jsonify({'status': 'error', 'message': 'User not found.'}), 404
    if user.id == g.current_user.id:
        return jsonify({'status': 'error', 'message': 'Cannot delete your own account.'}), 400

    user_email = user.email
    db.session.delete(user)
    db.session.commit()

    log_audit(g.current_user.id, 'user_deleted', 'user', user_id, {'email': user_email})
    _add_system_log(f"Admin {g.current_user.email} deleted user '{user_email}'.", 'WARNING')

    return jsonify({'status': 'success', 'message': f'User {user_email} deleted.'})


@app.route('/api/admin/users/<int:user_id>/reset-password', methods=['POST'])
@login_required
@admin_required(['super_admin', 'admin', 'support'])
def admin_reset_password(user_id: int):
    """Reset a user's password with a temporary password."""
    user = User.query.get(user_id)
    if not user:
        return jsonify({'status': 'error', 'message': 'User not found.'}), 404

    data = request.get_json(silent=True) or {}
    new_password = data.get('new_password', '')

    if not new_password:
        import secrets
        import string
        alphabet = string.ascii_letters + string.digits
        new_password = ''.join(secrets.choice(alphabet) for _ in range(12))

    user.password_hash = generate_password_hash(new_password)
    db.session.commit()

    log_audit(g.current_user.id, 'password_reset', 'user', user_id, {'email': user.email})
    _add_system_log(f"Admin {g.current_user.email} reset password for user '{user.email}'.", 'WARNING')

    return jsonify({
        'status': 'success',
        'message': f'Password reset for {user.email}.',
        'temporary_password': new_password,
    })


@app.route('/api/admin/users/bulk', methods=['POST'])
@login_required
@admin_required(['super_admin', 'admin'])
def admin_bulk_user_action():
    """Perform bulk actions on users (delete, suspend, export, notify)."""
    data = request.get_json(silent=True) or {}
    action = data.get('action', '')
    user_ids = data.get('user_ids', [])

    if not user_ids:
        return jsonify({'status': 'error', 'message': 'No users selected.'}), 400

    users = User.query.filter(User.id.in_(user_ids)).all()
    results = {'affected': 0, 'skipped': 0, 'details': []}

    if action == 'suspend':
        for u in users:
            if hasattr(u, 'account_status'):
                u.account_status = 'suspended'
                results['affected'] += 1
        db.session.commit()
        log_audit(g.current_user.id, 'users_suspended', 'user', None, {'count': len(user_ids)})
    elif action == 'activate':
        for u in users:
            if hasattr(u, 'account_status'):
                u.account_status = 'active'
                results['affected'] += 1
        db.session.commit()
        log_audit(g.current_user.id, 'users_activated', 'user', None, {'count': len(user_ids)})
    elif action == 'ban':
        for u in users:
            if hasattr(u, 'account_status'):
                u.account_status = 'banned'
                results['affected'] += 1
        db.session.commit()
        log_audit(g.current_user.id, 'users_banned', 'user', None, {'count': len(user_ids)})
    elif action == 'delete':
        for u in users:
            if u.id != g.current_user.id:
                db.session.delete(u)
                results['affected'] += 1
            else:
                results['skipped'] += 1
        db.session.commit()
        log_audit(g.current_user.id, 'users_bulk_deleted', 'user', None, {'count': results['affected']})
    elif action == 'export':
        export_data = [{
            'id': u.id, 'email': u.email, 'name': u.name,
            'role': getattr(u, 'role', 'user'),
            'status': getattr(u, 'account_status', 'active'),
            'plan': u.plan,
            'created_at': u.created_at.isoformat() if u.created_at else None,
            'last_login': u.last_login_at.isoformat() if getattr(u, 'last_login_at', None) else None,
        } for u in users]
        return jsonify({'status': 'success', 'export_data': export_data, 'format': 'json'})
    else:
        return jsonify({'status': 'error', 'message': f'Unknown action: {action}'}), 400

    return jsonify({'status': 'success', 'message': f'Action "{action}" completed.', 'results': results})


# --- Error Log Management ---

@app.route('/api/admin/errors', methods=['GET'])
@login_required
@admin_required()
def admin_list_errors():
    """List all error logs with filtering and pagination."""
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 25, type=int)
    level = request.args.get('level', '')
    error_type = request.args.get('error_type', '')
    source = request.args.get('source', '')
    resolved = request.args.get('resolved', '')
    search = request.args.get('search', '').strip()
    date_from = request.args.get('date_from', '')
    date_to = request.args.get('date_to', '')

    query = ErrorLog.query
    if level:
        query = query.filter(ErrorLog.level == level.upper())
    if error_type:
        query = query.filter(ErrorLog.error_type.ilike(f'%{error_type}%'))
    if source:
        query = query.filter(ErrorLog.source == source)
    if resolved == 'true':
        query = query.filter(ErrorLog.resolved == True)
    elif resolved == 'false':
        query = query.filter(ErrorLog.resolved == False)
    if search:
        query = query.filter(ErrorLog.message.ilike(f'%{search}%'))
    if date_from:
        try:
            query = query.filter(ErrorLog.timestamp >= datetime.fromisoformat(date_from))
        except ValueError:
            pass
    if date_to:
        try:
            query = query.filter(ErrorLog.timestamp <= datetime.fromisoformat(date_to))
        except ValueError:
            pass

    query = query.order_by(ErrorLog.timestamp.desc())
    total = query.count()
    errors = query.offset((page - 1) * per_page).limit(per_page).all()

    return jsonify({
        'status': 'success',
        'errors': [e.to_dict() for e in errors],
        'total': total, 'page': page, 'per_page': per_page,
        'total_pages': (total + per_page - 1) // per_page,
    })


@app.route('/api/admin/errors/<int:error_id>/resolve', methods=['POST'])
@login_required
@admin_required(['super_admin', 'admin'])
def admin_resolve_error(error_id: int):
    """Mark an error as resolved."""
    error_entry = ErrorLog.query.get(error_id)
    if not error_entry:
        return jsonify({'status': 'error', 'message': 'Error log not found.'}), 404

    error_entry.resolved = True
    error_entry.resolved_at = datetime.utcnow()
    error_entry.resolved_by = g.current_user.id
    db.session.commit()

    log_audit(g.current_user.id, 'error_resolved', 'error_log', error_id)
    return jsonify({'status': 'success', 'message': 'Error marked as resolved.', 'error': error_entry.to_dict()})


@app.route('/api/admin/errors/export', methods=['GET'])
@login_required
@admin_required()
def admin_export_errors():
    """Export error logs in JSON or CSV format."""
    export_format = request.args.get('format', 'json')
    level = request.args.get('level', '')
    date_from = request.args.get('date_from', '')
    date_to = request.args.get('date_to', '')

    query = ErrorLog.query
    if level:
        query = query.filter(ErrorLog.level == level.upper())
    if date_from:
        try:
            query = query.filter(ErrorLog.timestamp >= datetime.fromisoformat(date_from))
        except ValueError:
            pass
    if date_to:
        try:
            query = query.filter(ErrorLog.timestamp <= datetime.fromisoformat(date_to))
        except ValueError:
            pass

    errors = query.order_by(ErrorLog.timestamp.desc()).limit(10000).all()
    error_list = [e.to_dict() for e in errors]

    if export_format == 'csv':
        import io
        import csv as csv_module
        output = io.StringIO()
        writer = csv_module.writer(output)
        writer.writerow(['ID', 'Timestamp', 'Level', 'Type', 'Message', 'Source', 'User', 'URL', 'Resolved'])
        for e in error_list:
            writer.writerow([e['id'], e['timestamp'], e['level'], e['error_type'],
                             e['message'], e['source'], e.get('user_email', ''),
                             e.get('url', ''), 'Yes' if e['resolved'] else 'No'])
        csv_content = output.getvalue()
        output.close()
        return jsonify({'status': 'success', 'format': 'csv', 'data': csv_content,
                        'filename': f'error_logs_{datetime.utcnow().strftime("%Y%m%d_%H%M%S")}.csv'})

    return jsonify({'status': 'success', 'format': 'json', 'data': error_list,
                    'filename': f'error_logs_{datetime.utcnow().strftime("%Y%m%d_%H%M%S")}.json'})


@app.route('/api/admin/errors/stats', methods=['GET'])
@login_required
@admin_required()
def admin_error_stats():
    """Get error statistics summary."""
    total = ErrorLog.query.count()
    unresolved = ErrorLog.query.filter_by(resolved=False).count()
    critical = ErrorLog.query.filter_by(level='CRITICAL', resolved=False).count()
    errors = ErrorLog.query.filter_by(level='ERROR', resolved=False).count()
    warnings = ErrorLog.query.filter_by(level='WARNING', resolved=False).count()

    from sqlalchemy import func
    by_type = db.session.query(
        ErrorLog.error_type, func.count(ErrorLog.id)
    ).filter(ErrorLog.resolved == False).group_by(ErrorLog.error_type).order_by(
        func.count(ErrorLog.id).desc()
    ).limit(10).all()

    by_source = db.session.query(
        ErrorLog.source, func.count(ErrorLog.id)
    ).filter(ErrorLog.resolved == False).group_by(ErrorLog.source).all()

    return jsonify({
        'status': 'success',
        'stats': {
            'total': total, 'unresolved': unresolved, 'critical': critical,
            'errors': errors, 'warnings': warnings,
            'by_type': [{'type': t, 'count': c} for t, c in by_type],
            'by_source': [{'source': s, 'count': c} for s, c in by_source],
            'health': 'healthy' if unresolved == 0 else ('critical' if critical > 0 else 'warning'),
        },
    })


# --- Client-side error reporting ---

@app.route('/api/admin/errors/report', methods=['POST'])
def report_client_error():
    """Accept error reports from the client-side application."""
    data = request.get_json(silent=True) or {}
    user_id = None
    user_email = None
    try:
        auth_header = request.headers.get('Authorization', '')
        if auth_header.startswith('Bearer '):
            payload = decode_jwt(auth_header[7:])
            user = User.query.get(payload.get('user_id'))
            if user:
                user_id = user.id
                user_email = user.email
    except Exception:
        pass

    log_error(
        level=data.get('level', 'ERROR'),
        error_type=data.get('error_type', 'ClientError'),
        message=data.get('message', 'Unknown client error'),
        stack_trace=data.get('stack_trace'),
        source='client',
        user_id=user_id,
        user_email=user_email,
        url=data.get('url'),
        context_data=data.get('context_data'),
    )
    return jsonify({'status': 'success', 'message': 'Error reported.'}), 201


# --- Audit Log ---

@app.route('/api/admin/audit-logs', methods=['GET'])
@login_required
@admin_required()
def admin_list_audit_logs():
    """List audit log entries with filtering and pagination."""
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 25, type=int)
    action = request.args.get('action', '')
    admin_id = request.args.get('admin_id', type=int)
    target_type = request.args.get('target_type', '')
    search = request.args.get('search', '').strip()
    date_from = request.args.get('date_from', '')
    date_to = request.args.get('date_to', '')

    query = AuditLog.query
    if action:
        query = query.filter(AuditLog.action.ilike(f'%{action}%'))
    if admin_id:
        query = query.filter(AuditLog.admin_id == admin_id)
    if target_type:
        query = query.filter(AuditLog.target_type == target_type)
    if search:
        query = query.filter(
            (AuditLog.admin_email.ilike(f'%{search}%')) |
            (AuditLog.action.ilike(f'%{search}%')) |
            (AuditLog.details.ilike(f'%{search}%'))
        )
    if date_from:
        try:
            query = query.filter(AuditLog.timestamp >= datetime.fromisoformat(date_from))
        except ValueError:
            pass
    if date_to:
        try:
            query = query.filter(AuditLog.timestamp <= datetime.fromisoformat(date_to))
        except ValueError:
            pass

    query = query.order_by(AuditLog.timestamp.desc())
    total = query.count()
    logs = query.offset((page - 1) * per_page).limit(per_page).all()

    return jsonify({
        'status': 'success',
        'logs': [log.to_dict() for log in logs],
        'total': total, 'page': page, 'per_page': per_page,
        'total_pages': (total + per_page - 1) // per_page,
    })


@app.route('/api/admin/audit-logs/export', methods=['GET'])
@login_required
@admin_required()
def admin_export_audit_logs():
    """Export audit logs in JSON or CSV format."""
    export_format = request.args.get('format', 'json')
    date_from = request.args.get('date_from', '')
    date_to = request.args.get('date_to', '')

    query = AuditLog.query
    if date_from:
        try:
            query = query.filter(AuditLog.timestamp >= datetime.fromisoformat(date_from))
        except ValueError:
            pass
    if date_to:
        try:
            query = query.filter(AuditLog.timestamp <= datetime.fromisoformat(date_to))
        except ValueError:
            pass

    logs = query.order_by(AuditLog.timestamp.desc()).limit(10000).all()
    log_list = [log.to_dict() for log in logs]

    if export_format == 'csv':
        import io
        import csv as csv_module
        output = io.StringIO()
        writer = csv_module.writer(output)
        writer.writerow(['ID', 'Timestamp', 'Admin', 'Action', 'Target Type', 'Target ID', 'Details', 'IP Address'])
        for l in log_list:
            writer.writerow([l['id'], l['timestamp'], l.get('admin_email', ''),
                             l['action'], l.get('target_type', ''), l.get('target_id', ''),
                             json.dumps(l.get('details', {})), l.get('ip_address', '')])
        csv_content = output.getvalue()
        output.close()
        return jsonify({'status': 'success', 'format': 'csv', 'data': csv_content,
                        'filename': f'audit_logs_{datetime.utcnow().strftime("%Y%m%d_%H%M%S")}.csv'})

    return jsonify({'status': 'success', 'format': 'json', 'data': log_list,
                    'filename': f'audit_logs_{datetime.utcnow().strftime("%Y%m%d_%H%M%S")}.json'})


# --- System Settings ---

@app.route('/api/admin/settings', methods=['GET'])
@login_required
@admin_required()
def admin_get_settings():
    """Get all system settings."""
    category = request.args.get('category', '')
    query = SystemSetting.query
    if category:
        query = query.filter(SystemSetting.category == category)
    settings = query.all()
    return jsonify({'status': 'success', 'settings': [s.to_dict() for s in settings]})


@app.route('/api/admin/settings', methods=['PUT'])
@login_required
@admin_required(['super_admin', 'admin'])
def admin_update_settings():
    """Update system settings (batch update)."""
    data = request.get_json(silent=True) or {}
    settings_data = data.get('settings', [])
    if not settings_data:
        return jsonify({'status': 'error', 'message': 'No settings provided.'}), 400

    updated = []
    for item in settings_data:
        key = item.get('key')
        value = item.get('value')
        category = item.get('category', 'general')
        if not key:
            continue

        setting = SystemSetting.query.filter_by(key=key).first()
        if setting:
            setting.value = str(value) if value is not None else ''
            setting.category = category
            setting.updated_at = datetime.utcnow()
            setting.updated_by = g.current_user.id
        else:
            setting = SystemSetting(key=key, value=str(value) if value is not None else '',
                                    category=category, updated_by=g.current_user.id)
            db.session.add(setting)
        updated.append(setting.to_dict())

    db.session.commit()
    log_audit(g.current_user.id, 'settings_updated', 'setting', None,
              {'keys': [s['key'] for s in updated]})

    return jsonify({'status': 'success', 'settings': updated, 'message': f'{len(updated)} settings updated.'})


# --- Notifications ---

@app.route('/api/admin/notifications', methods=['GET'])
@login_required
@admin_required()
def admin_list_notifications():
    """List all admin notifications."""
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 20, type=int)
    query = AdminNotification.query.order_by(AdminNotification.created_at.desc())
    total = query.count()
    notifications = query.offset((page - 1) * per_page).limit(per_page).all()
    return jsonify({
        'status': 'success',
        'notifications': [n.to_dict() for n in notifications],
        'total': total, 'page': page, 'per_page': per_page,
        'total_pages': (total + per_page - 1) // per_page,
    })


@app.route('/api/admin/notifications', methods=['POST'])
@login_required
@admin_required(['super_admin', 'admin'])
def admin_create_notification():
    """Create and send a notification to users."""
    data = request.get_json(silent=True) or {}
    title = (data.get('title') or '').strip()
    message = (data.get('message') or '').strip()
    notification_type = data.get('notification_type', 'info')
    target_type = data.get('target_type', 'all')
    target_users = data.get('target_users', [])

    if not title or not message:
        return jsonify({'status': 'error', 'message': 'Title and message are required.'}), 400

    notification = AdminNotification(
        title=title, message=message, notification_type=notification_type,
        target_type=target_type, created_by=g.current_user.id, is_sent=True,
    )
    notification.set_target_users(target_users)
    db.session.add(notification)
    db.session.commit()

    log_audit(g.current_user.id, 'notification_sent', 'notification', notification.id,
              {'title': title, 'target_type': target_type})
    _add_system_log(f"Admin {g.current_user.email} sent notification: '{title}'.", 'INFO')

    return jsonify({'status': 'success', 'notification': notification.to_dict()}), 201


# --- Scheduled Tasks ---

@app.route('/api/admin/tasks', methods=['GET'])
@login_required
@admin_required()
def admin_list_tasks():
    """List all scheduled tasks and their status."""
    tasks = ScheduledTask.query.order_by(ScheduledTask.name).all()
    return jsonify({'status': 'success', 'tasks': [t.to_dict() for t in tasks]})


@app.route('/api/admin/tasks/<int:task_id>/run', methods=['POST'])
@login_required
@admin_required(['super_admin', 'admin'])
def admin_run_task(task_id: int):
    """Manually trigger a scheduled task."""
    task = ScheduledTask.query.get(task_id)
    if not task:
        return jsonify({'status': 'error', 'message': 'Task not found.'}), 404

    task.status = 'running'
    task.last_run = datetime.utcnow()
    task.add_log(f'Manually triggered by admin {g.current_user.email}', 'INFO')
    db.session.commit()

    try:
        task.status = 'completed'
        task.add_log('Task completed successfully.', 'INFO')
    except Exception as e:
        task.status = 'failed'
        task.add_log(f'Task failed: {str(e)}', 'ERROR')
        log_error('ERROR', 'TaskError', f'Task {task.name} failed: {e}',
                  source='server', user_id=g.current_user.id)

    db.session.commit()
    log_audit(g.current_user.id, 'task_triggered', 'scheduled_task', task_id,
              {'task_name': task.name})

    return jsonify({'status': 'success', 'task': task.to_dict()})


# --- Reports ---

@app.route('/api/admin/reports/users', methods=['GET'])
@login_required
@admin_required()
def admin_report_users():
    """Generate a downloadable user statistics report."""
    export_format = request.args.get('format', 'json')
    date_from = request.args.get('date_from', '')
    date_to = request.args.get('date_to', '')

    query = User.query
    if date_from:
        try:
            query = query.filter(User.created_at >= datetime.fromisoformat(date_from))
        except ValueError:
            pass
    if date_to:
        try:
            query = query.filter(User.created_at <= datetime.fromisoformat(date_to))
        except ValueError:
            pass

    users = query.order_by(User.created_at.desc()).all()
    total = len(users)
    by_role = {}
    by_status = {}
    by_plan = {}

    for u in users:
        role = getattr(u, 'role', 'user') or 'user'
        status = getattr(u, 'account_status', 'active') or 'active'
        plan = u.plan or 'Free'
        by_role[role] = by_role.get(role, 0) + 1
        by_status[status] = by_status.get(status, 0) + 1
        by_plan[plan] = by_plan.get(plan, 0) + 1

    report = {
        'generated_at': datetime.utcnow().isoformat(),
        'total_users': total,
        'by_role': by_role,
        'by_status': by_status,
        'by_plan': by_plan,
        'users': [{
            'id': u.id, 'email': u.email, 'name': u.name,
            'role': getattr(u, 'role', 'user'),
            'status': getattr(u, 'account_status', 'active'),
            'plan': u.plan,
            'created_at': u.created_at.isoformat() if u.created_at else None,
        } for u in users],
    }

    if export_format == 'csv':
        import io
        import csv as csv_module
        output = io.StringIO()
        writer = csv_module.writer(output)
        writer.writerow(['ID', 'Email', 'Name', 'Role', 'Status', 'Plan', 'Created At'])
        for u in report['users']:
            writer.writerow([u['id'], u['email'], u['name'], u['role'],
                             u['status'], u['plan'], u['created_at']])
        csv_content = output.getvalue()
        output.close()
        return jsonify({
            'status': 'success', 'format': 'csv', 'data': csv_content,
            'summary': {k: v for k, v in report.items() if k != 'users'},
            'filename': f'user_report_{datetime.utcnow().strftime("%Y%m%d_%H%M%S")}.csv',
        })

    return jsonify({
        'status': 'success', 'format': 'json', 'data': report,
        'filename': f'user_report_{datetime.utcnow().strftime("%Y%m%d_%H%M%S")}.json',
    })


# --- Real-time Log Tail ---

@app.route('/api/admin/logs/tail', methods=['GET'])
@login_required
@admin_required()
def admin_log_tail():
    """Get the most recent system logs for real-time tail view."""
    limit = request.args.get('limit', 50, type=int)
    level = request.args.get('level', '')
    with _system_logs_lock:
        logs = list(_system_logs)
    if level:
        logs = [l for l in logs if l.get('level', '').upper() == level.upper()]
    logs = logs[:limit]
    return jsonify({'status': 'success', 'logs': logs, 'total_available': len(_system_logs)})


# --- Site Health Check ---

@app.route('/api/admin/health', methods=['GET'])
@login_required
@admin_required()
def admin_health_check():
    """Quick site health check."""
    unresolved_errors = ErrorLog.query.filter_by(resolved=False).count()
    critical_errors = ErrorLog.query.filter_by(level='CRITICAL', resolved=False).count()
    total_users = User.query.count()
    connected_accounts = Account.query.filter_by(status='Connected').count()

    health_status = 'healthy'
    issues = []
    if critical_errors > 0:
        health_status = 'critical'
        issues.append(f'{critical_errors} critical error(s) unresolved')
    elif unresolved_errors > 0:
        health_status = 'warning'
        issues.append(f'{unresolved_errors} unresolved error(s)')
    elif unresolved_errors == 0:
        issues.append('No issues found')

    return jsonify({
        'status': 'success',
        'health': {
            'status': health_status,
            'issues': issues,
            'unresolved_errors': unresolved_errors,
            'critical_errors': critical_errors,
            'total_users': total_users,
            'connected_accounts': connected_accounts,
        },
    })


# =============================================================================
# STATIC FILE SERVING (React SPA in production mode)
# =============================================================================

if PRODUCTION:
    @app.route('/', defaults={'path': ''})
    @app.route('/<path:path>')
    def serve_spa(path: str):
        """Serve the React SPA.

        If the requested path matches a static file in the dist directory,
        serve it directly. API routes are excluded from SPA serving.
        Otherwise, serve index.html for client-side routing.
        """
        # Never intercept API routes
        if path.startswith('api/'):
            return jsonify({'status': 'error', 'message': 'Not found'}), 404
        if path and os.path.isfile(os.path.join(DIST_DIR, path)):
            return send_from_directory(DIST_DIR, path)
        return send_from_directory(DIST_DIR, 'index.html')

    _add_system_log(f"Static serving enabled from: {DIST_DIR}", 'INFO')
else:
    _add_system_log(
        "Static serving disabled (dist/ not found). Running in API-only mode.", 'INFO'
    )


# =============================================================================
# MAIN ENTRY POINT
# =============================================================================
# NOTE: Use run.py to start the server. Running novasend.py directly
# will conflict with the main server process on the same port.

if __name__ == '__main__':
    print(
        "ERROR: Do not run novasend.py directly.\n"
        "Use 'python run.py' to start the NovaSend server."
    )
    import sys as _sys
    _sys.exit(1)
