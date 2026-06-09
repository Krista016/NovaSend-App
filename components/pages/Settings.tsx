import React, { useState } from 'react';
import Card from '../ui/Card';
import Button from '../ui/Button';
import { useAppContext } from '../../hooks/useAppContext';
import type { GradientPalette, GlobalPlaceholder } from '../../types';
import { TrashIcon, DownloadIcon } from '../icons/Icons';

const pythonScriptContent = `#!/usr/bin/env python3
"""
NovaSend Ghost Protocol Agent - Playwright Edition
A WhatsApp Web automation agent using Playwright for reliable, modern browser control.
Uses a single-threaded background worker queue to prevent greenlet/multithreading errors.
"""

import threading
import time
import random
import re
import os
import logging
import queue
from datetime import datetime
from flask import Flask, request, jsonify
from flask_cors import CORS

# --- Ghost Protocol Imports ---
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


# --- Basic Logging Setup ---
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# --- Flask App Setup ---
app = Flask(__name__)
CORS(app)

# --- Global State ---
campaign_state = {
    "campaign_id": None,
    "is_running": False,
    "is_paused": False,
    "sent_count": 0,
    "failed_count": 0,
    "campaign_logs": [],
    "system_logs": [],
    "contacts": [],
    "message_template": "",
    "attachment_path": None,
    "send_as_caption": False,
    "global_placeholders": [],
    "settings": {},
    "current_index": 0,
    "account_id": None,
    "is_connected": False
}

playwright_instance = None
browser_context = None
page = None
playwright_thread_id = None

# User-agent string for a standard Chrome on Windows
STEALTH_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/131.0.0.0 Safari/537.36"
)


# --- SQLite Diagnostics & Telemetry Helpers ---
def _increment_account_metric(account_id, metric_name):
    """Safely increment a numeric metric column in the accounts table."""
    try:
        workspace_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..")) if os.path.basename(os.path.abspath(os.path.dirname(__file__))) == '.playwright-mcp' else os.path.abspath(os.path.dirname(__file__))
        db_path = os.path.join(workspace_dir, "novasend.db")
        if not os.path.exists(db_path):
            return
        import sqlite3
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        cursor.execute(f"UPDATE accounts SET {metric_name} = COALESCE({metric_name}, 0) + 1 WHERE id = ?", (int(account_id),))
        conn.commit()
        conn.close()
    except Exception as e:
        _log_event(f"Error updating account metric {metric_name} in DB: {e}", 'system')

def _set_account_status_local(account_id, status):
    """Safely update account status in the SQLite database."""
    try:
        workspace_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..")) if os.path.basename(os.path.abspath(os.path.dirname(__file__))) == '.playwright-mcp' else os.path.abspath(os.path.dirname(__file__))
        db_path = os.path.join(workspace_dir, "novasend.db")
        if not os.path.exists(db_path):
            return
        import sqlite3
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        cursor.execute("UPDATE accounts SET status = ? WHERE id = ?", (status, int(account_id)))
        conn.commit()
        conn.close()
    except Exception as e:
        _log_event(f"Error updating account status in DB: {e}", 'system')

def _check_warm_up_limit_local(account_id):
    """Calculate warm-up limit and check daily sent count directly in SQLite."""
    try:
        workspace_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..")) if os.path.basename(os.path.abspath(os.path.dirname(__file__))) == '.playwright-mcp' else os.path.abspath(os.path.dirname(__file__))
        db_path = os.path.join(workspace_dir, "novasend.db")
        if not os.path.exists(db_path):
            return False, 0, 0
        import sqlite3
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        cursor.execute("SELECT created_at FROM accounts WHERE id = ?", (int(account_id),))
        row = cursor.fetchone()
        if not row:
            conn.close()
            return False, 0, 0
        created_at_str = row[0]
        
        try:
            created_at = datetime.fromisoformat(created_at_str.replace('Z', '+00:00'))
        except:
            try:
                created_at = datetime.strptime(created_at_str.split('.')[0], '%Y-%m-%d %H:%M:%S')
            except:
                created_at = datetime.utcnow()
                
        days_active = max(0, (datetime.utcnow() - created_at).days)
        daily_limit = min(500, int(20 * (1.10 ** days_active)))
        
        today_start_str = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0).strftime('%Y-%m-%d %H:%M:%S')
        cursor.execute("""
            SELECT COUNT(cl.id) 
            FROM campaign_logs cl
            JOIN campaigns c ON cl.campaign_id = c.id
            WHERE c.account_id = ? AND cl.status = 'Sent' AND cl.timestamp >= ?
        """, (int(account_id), today_start_str))
        sent_today = cursor.fetchone()[0] or 0
        conn.close()
        return sent_today >= daily_limit, sent_today, daily_limit
    except Exception as e:
        _log_event(f"Error checking warm-up limit in DB: {e}", 'system')
        return False, 0, 0

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


# --- Command Queue for Single-Threaded Playwright Execution ---
command_queue = queue.Queue()

# --- Message Processing Logic ---
def process_spintax(text):
    pattern = re.compile(r'\\{([^{}]*\\|[^{}]*)\\}')
    while True:
        match = pattern.search(text)
        if not match: break
        options_string = match.group(1)
        options = options_string.split('|')
        chosen_option = random.choice(options)
        text = text[:match.start()] + chosen_option + text[match.end():]
    return text


def personalize_message(text, contact):
    first_name = contact.get('firstName', ''); last_name = contact.get('lastName', '')
    text = text.replace('{FirstName}', first_name).replace('{LastName}', last_name)
    return text

def apply_global_placeholders(text, placeholders):
    for p in placeholders:
        key, value = p.get('key'), p.get('value')
        if key and value: text = text.replace('{{' + key + '}}', value)
    return text

def format_message(text):
    return text.replace('|', '\\n')

def process_message_for_contact(template, contact, placeholders):
    message = apply_global_placeholders(template, placeholders)
    message = personalize_message(message, contact)
    message = process_spintax(message)
    return format_message(message)

# --- Centralized Logging System ---
def _log_event(message, log_type='system', data=None):
    logging.info(message)
    timestamp = datetime.now().strftime("%H:%M:%S")
    if log_type == 'system':
        campaign_state["system_logs"].insert(0, f"[{timestamp}] {message}")
        campaign_state["system_logs"] = campaign_state["system_logs"][:100]
    elif log_type == 'campaign' and data is not None:
        data_with_ts = {**data, "timestamp": timestamp}
        campaign_state["campaign_logs"].insert(0, data_with_ts)
        campaign_state["campaign_logs"] = campaign_state["campaign_logs"][:100]

# --- File Handling (Shared Folder Method) ---
def _find_attachment_in_shared_folder():
    try:
        downloads_path = os.path.join(os.path.expanduser('~'), 'Downloads')
        attach_folder = os.path.join(downloads_path, 'Attach')
        
        if not os.path.isdir(attach_folder):
            _log_event("Attachment folder '~/Downloads/Attach' not found.", 'system')
            return None, "Folder not found"

        files = [f for f in os.listdir(attach_folder) if os.path.isfile(os.path.join(attach_folder, f))]
        if not files:
            _log_event("No file found in '~/Downloads/Attach'.", 'system')
            return None, "No file found"
            
        if len(files) > 1:
            _log_event(f"Warning: Multiple files found. Using the first one: {files[0]}", 'system')
            
        return os.path.join(attach_folder, files[0]), "File found"
    except Exception as e:
        _log_event(f"Error accessing attachment folder: {e}", 'system')
        return None, "Error accessing folder"

# --- GHOST PROTOCOL: CORE BEHAVIORS ---
_last_mouse_pos = None

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

def _move_mouse_bezier(end_x, end_y):
    global _last_mouse_pos
    try:
        if _last_mouse_pos is None:
            _last_mouse_pos = (random.uniform(100, 500), random.uniform(100, 500))
        
        start_x, start_y = _last_mouse_pos
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
            
        _last_mouse_pos = (end_x, end_y)
    except Exception:
        try:
            page.mouse.move(end_x, end_y)
            _last_mouse_pos = (end_x, end_y)
        except:
            pass

def _move_and_click_humanly(locator):
    try:
        box = locator.bounding_box()
        if not box:
            locator.click(timeout=5000)
            return
        target_x = box['x'] + random.uniform(box['width'] * 0.2, box['width'] * 0.8)
        target_y = box['y'] + random.uniform(box['height'] * 0.2, box['height'] * 0.8)
        _move_mouse_bezier(target_x, target_y)
        
        # Pre-click eye-coordination check pause
        time.sleep(random.uniform(0.15, 0.4))
        page.mouse.click(target_x, target_y)
    except Exception:
        try:
            locator.click(timeout=5000)
        except Exception:
            pass

def _human_like_typing_with_flaws(text: str):
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

    lines = text.split('\\n')
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

def _clear_search_box():
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
            _move_and_click_humanly(search_box)
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

def _find_and_open_chat_via_search(number):
    try:
        # Check if already in chat with this number
        try:
            header_title = page.locator('//header[@data-testid="conversation-header"]//span[@dir="auto"]').first
            if header_title.is_visible(timeout=500):
                title_text = header_title.text_content()
                clean_num = "".join(filter(str.isdigit, number))
                clean_title = "".join(filter(str.isdigit, title_text))
                if clean_num[-8:] in clean_title or clean_title[-8:] in clean_num:
                    _log_event(f"Already in chat with {number}.", 'system')
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
            
        _move_and_click_humanly(search_box)
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
            
        _log_event(f"Searching for contact {search_term}...", 'system')
        _human_like_typing_with_flaws(search_term)
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
            _log_event("Match found in search list. Opening chat...", 'system')
            _move_and_click_humanly(chat_row)
            scan_delay = random.uniform(1.5, 3.0)
            _log_event(f"Simulating human scanning delay of {scan_delay:.1f} seconds...", 'system')
            time.sleep(scan_delay)
            
            try:
                main_message_box = page.locator('//footer//div[@role="textbox"]').first
                if main_message_box.is_visible(timeout=3000):
                    _clear_search_box()
                    return True
            except:
                pass
                
        _clear_search_box()
        return False
    except Exception as e:
        _log_event(f"Search-based opening error: {e}", 'system')
        _clear_search_box()
        return False


# --- GHOST PROTOCOL: IDLE SIMULATION TASKS ---
def _idle_task_check_statuses():
    try:
        status_button = page.locator("//span[@data-icon='status-v3-outline']/ancestor::div[@role='button']").first
        _move_and_click_humanly(status_button)
        time.sleep(random.uniform(1.0, 2.0))
        chats_button = page.locator("//span[@data-icon='chat']/ancestor::div[@role='button']").first
        _move_and_click_humanly(chats_button)
        time.sleep(random.uniform(0.5, 1.0))
    except Exception as e:
        pass

def _idle_task_scroll_chat_list():
    try:
        pane_side = page.locator('#pane-side').first
        for _ in range(random.randint(1, 3)):
            scroll_amount = random.randint(-300, 300)
            pane_side.evaluate('(el, amount) => el.scrollTop += amount', scroll_amount)
            time.sleep(random.uniform(0.5, 1.5))
    except Exception as e:
        pass

def _idle_task_hover_chats():
    try:
        chat_items = page.locator('div[role="row"], div[data-testid="chat-list-item"]').all()
        if chat_items:
            target = random.choice(chat_items[:5])
            box = target.bounding_box()
            if box:
                target_x = box['x'] + random.uniform(box['width'] * 0.2, box['width'] * 0.8)
                target_y = box['y'] + random.uniform(box['height'] * 0.2, box['height'] * 0.8)
                _move_mouse_bezier(target_x, target_y)
                time.sleep(random.uniform(0.5, 1.5))
    except Exception:
        pass

def _idle_task_mouse_wander():
    try:
        for _ in range(random.randint(2, 4)):
            x = random.uniform(200, 1000)
            y = random.uniform(200, 800)
            _move_mouse_bezier(x, y)
            time.sleep(random.uniform(0.4, 1.2))
    except Exception:
        pass

def _simulate_idle_activity():
    approved_tasks = [_idle_task_check_statuses, _idle_task_scroll_chat_list, _idle_task_hover_chats, _idle_task_mouse_wander]
    random.choice(approved_tasks)()


# --- CORE WHATSAPP AUTOMATION ---
def _attach_file_reliably(file_path, max_retries=3):
    _log_event(f"Attachment protocol initiated for {os.path.basename(file_path)}.", 'system')
    media_extensions = ['.jpg', '.jpeg', '.png', '.gif', '.mp4', '.mov', '.avi', '.mkv', '.webp']
    file_extension = os.path.splitext(file_path)[1].lower()
    
    if file_extension in media_extensions:
        file_type_button_text = 'Photos & videos'
    else:
        file_type_button_text = 'Document'

    for attempt in range(1, max_retries + 1):
        try:
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
            attach_button.click(timeout=10000)
            time.sleep(random.uniform(0.8, 1.2))

            if file_type_button_text == 'Photos & videos':
                pattern = re.compile(r'Photos\\s*&\\s*Videos', re.IGNORECASE)
            else:
                pattern = re.compile(r'Document', re.IGNORECASE)

            file_type_button = page.locator('li, button, div[role="button"], span').filter(has_text=pattern).first
            file_type_button.wait_for(state='visible', timeout=10000)
            
            with page.expect_file_chooser(timeout=30000) as fc_info:
                file_type_button.click(timeout=15000)
            
            file_chooser = fc_info.value
            file_chooser.set_files(file_path)
            return
        except Exception as e:
            _log_event(f"Attachment attempt {attempt} failed: {e}", 'system')
            if attempt < max_retries:
                try: page.keyboard.press('Escape')
                except: pass
                time.sleep(random.uniform(1.0, 2.0))
            else:
                raise Exception(f"Failed to attach file after {max_retries} attempts: {e}")

def _find_caption_box():
    caption_box_selectors = [
        '//div[@aria-label="Send photo"]//div[@role="textbox"]',
        '//div[@aria-label="Send video"]//div[@role="textbox"]',
        '//div[@aria-label="Send document"]//div[@role="textbox"]',
        '//div[contains(@class, "_amig")]//div[@role="textbox"]',
        '//div[@data-animate-modal-body="1"]//div[@role="textbox"]',
        '//div[contains(@class, "g0rxnol2")]//div[@role="textbox"]',
        '//div[@role="dialog"]//div[@role="textbox"]',
    ]
    for selector in caption_box_selectors:
        try:
            locator = page.locator(selector).first
            locator.wait_for(state='visible', timeout=2000)
            return locator
        except Exception:
            continue
    try:
        all_textboxes = page.locator('//div[@role="textbox"]')
        count = all_textboxes.count()
        for idx in range(count):
            tb = all_textboxes.nth(idx)
            parent_footer = tb.locator('xpath=ancestor::footer')
            if parent_footer.count() == 0 and tb.is_visible():
                return tb
    except Exception:
        pass
    return None

def _find_and_click_send_button_robustly():
    time.sleep(random.uniform(1.0, 1.5))
    caption_box_selectors = [
        '//div[@aria-label="Send photo"]//div[@role="textbox"]',
        '//div[@aria-label="Send video"]//div[@role="textbox"]',
        '//div[@aria-label="Send document"]//div[@role="textbox"]',
        '//div[contains(@class, "_amig")]//div[@role="textbox"]',
        '//div[@data-animate-modal-body="1"]//div[@role="textbox"]',
        '//div[contains(@class, "g0rxnol2")]//div[@role="textbox"]',
        '//div[@role="dialog"]//div[@role="textbox"]',
    ]
    for selector in caption_box_selectors:
        try:
            locator = page.locator(selector).first
            locator.wait_for(state='visible', timeout=3000)
            locator.press('Enter')
            time.sleep(1.0)
            return
        except Exception:
            continue
    
    button_selectors = [
        '//button[@aria-label="Send"]',
        '//span[@data-icon="wds-ic-send-filled"]/ancestor::button',
        '//div[@role="button" and @aria-label="Send"]',
        '//span[@data-icon="send"]/ancestor::button',
    ]
    for selector in button_selectors:
        try:
            locator = page.locator(selector).first
            locator.wait_for(state='visible', timeout=2000)
            locator.click()
            return
        except Exception:
            continue
    
    try:
        # Strategy 3: Keyboard fallback
        preview_dialog = page.locator('//div[@role="dialog"]').first
        if preview_dialog.is_visible():
            preview_dialog.click()
            time.sleep(0.3)
        page.keyboard.press('Enter')
        time.sleep(1.0)
        return
    except Exception:
        pass
    raise Exception("FATAL: All sending strategies failed.")

def _wait_for_chat_ready(timeout=15000):
    main_message_box_xpath = '//footer//div[@role="textbox"]'
    try:
        main_message_box = page.locator(main_message_box_xpath).first
        main_message_box.wait_for(state='visible', timeout=timeout)
        return main_message_box
    except Exception:
        try:
            invalid_number_elem = page.locator('//div[contains(text(), "Phone number shared via url is invalid")]').first
            if invalid_number_elem.is_visible(timeout=2000):
                # Try to dismiss the popup
                try:
                    ok_btn = page.locator('button:has-text("OK"), div[role="button"]:has-text("OK"), button:has-text("ok")').first
                    if ok_btn.is_visible(timeout=1000):
                        ok_btn.click()
                except:
                    pass
                raise Exception("Invalid phone number")
        except Exception:
            pass
        raise Exception("Chat input box not found")


def send_whatsapp_message(number, message, file_path, send_as_caption, detect_opt_out=False):
    try:
        if not page:
            return False, "Agent browser is not initialized."

        # Check for session expiration
        try:
            if page.locator('div[data-ref] canvas, canvas[aria-label="Scan me!"]').first.is_visible(timeout=1000):
                _log_event("Session expired (QR code displayed). Aborting campaign.", 'system')
                try:
                    account_id = campaign_state.get("account_id") or "default"
                    if account_id != "default":
                        _increment_account_metric(int(account_id), 'session_resets')
                        _set_account_status_local(int(account_id), 'Disconnected')
                except Exception as ex:
                    _log_event(f"Failed to update session expiration metric/status: {ex}", 'system')
                return False, "Session expired"
        except:
            pass

        # Try search-based chat opening first to avoid full page reload (stealth)
        chat_opened = _find_and_open_chat_via_search(number)
        if chat_opened:
            main_message_box = _wait_for_chat_ready(timeout=10000)
        else:
            url = f"https://web.whatsapp.com/send?phone={number}"
            page.goto(url, wait_until='domcontentloaded')
            main_message_box = _wait_for_chat_ready(timeout=45000)

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
                        _log_event(f"Opt-out request detected from {number} ('{last_text.strip()}'). Skipping message.", 'system')
                        return False, "Opt-out requested by contact"
            except Exception as e:
                _log_event(f"Error checking opt-out: {e}", 'system')


        
        # --- ATTACHMENT FLOW ---
        if file_path and os.path.exists(file_path):
            if send_as_caption and message:
                main_message_box.click(timeout=5000)
                time.sleep(random.uniform(0.3, 0.6))
                _attach_file_reliably(file_path)

                try:
                    page.locator('//div[@role="dialog"]|//div[@role="textbox"]').first.wait_for(state='visible', timeout=3000)
                except Exception:
                    pass
                time.sleep(random.uniform(1.0, 2.0))
                caption_box = _find_caption_box()
                if caption_box:
                    caption_box.click(timeout=5000)
                    time.sleep(random.uniform(0.2, 0.5))
                    _human_like_typing_with_flaws(message)
                    time.sleep(random.uniform(0.5, 1.0))
                else:
                    page.keyboard.press('Escape')
                    time.sleep(random.uniform(0.5, 1.0))
                    main_message_box = _wait_for_chat_ready(timeout=10000)
                    main_message_box.click(timeout=5000)
                    _human_like_typing_with_flaws(message)
                    time.sleep(random.uniform(0.5, 1.0))
                    page.keyboard.press('Enter')
                    time.sleep(random.uniform(2.0, 3.0))
                    _attach_file_reliably(file_path)
            else:
                if message:
                    main_message_box.click(timeout=5000)
                    _human_like_typing_with_flaws(message)
                    time.sleep(random.uniform(0.5, 1.0))
                    page.keyboard.press('Enter')
                    time.sleep(random.uniform(2.0, 3.0))
                _attach_file_reliably(file_path)

            _find_and_click_send_button_robustly()
        # --- TEXT-ONLY FLOW ---
        elif message:
            main_message_box.click(timeout=5000)
            _human_like_typing_with_flaws(message)
            time.sleep(random.uniform(0.5, 1.0))
            page.keyboard.press('Enter')

        time.sleep(random.uniform(1.0, 1.5))
        return True, "Message Sent"
    except Exception as e:
        if "invalid number" in str(e).lower():
             return False, "Invalid phone number"
        return False, f"Error: {str(e)[:100]}"

# --- WhatsApp Connection Check ---
def check_page_logged_in():
    global page
    if not page:
        return False
    try:
        chat_list_indicators = [
            '#pane-side',
            'div[data-testid="chat-list"]',
            '//div[@data-testid="chat-list-search"]',
            '[data-testid="chat-list-search"]',
            '[data-testid="chatlist-header"]',
            '[data-testid="menu-bar-menu"]',
        ]
        for indicator in chat_list_indicators:
            try:
                el = page.locator(indicator).first
                if el.is_visible(timeout=500):
                    _log_event(f"check_page_logged_in: Found indicator '{indicator}'. Account is connected.", 'system')
                    return True
            except Exception as e:
                _log_event(f"check_page_logged_in: Error checking '{indicator}': {e}", 'system')
                continue
    except Exception as e:
        _log_event(f"check_page_logged_in: Unexpected error: {e}", 'system')
    return False

# --- Default Browser Detection ---
def _get_default_browser_channel() -> str:
    import sys as _sys
    import subprocess
    if _sys.platform == 'win32':
        try:
            import winreg
            with winreg.OpenKey(
                winreg.HKEY_CURRENT_USER,
                r'Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\http\\UserChoice'
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
    return 'chrome'

# --- Flask API Endpoints ---
@app.route('/status', methods=['GET'])
def get_status():
    is_connected = campaign_state.get("is_connected", False)
    agent_status = "Online"
    if campaign_state["is_running"]: agent_status = "Busy"
    
    return jsonify({
        "agent_status": agent_status, "is_running": campaign_state["is_running"],
        "is_paused": campaign_state["is_paused"], "campaign_id": campaign_state["campaign_id"],
        "account_id": campaign_state.get("account_id"), "is_connected": is_connected,
        "sent_count": campaign_state["sent_count"], "failed_count": campaign_state["failed_count"],
        "current_index": campaign_state["current_index"],
        "total_contacts": len(campaign_state.get("contacts", [])),
        "campaign_logs": campaign_state["campaign_logs"], "system_logs": campaign_state["system_logs"],
    })

@app.route('/connect', methods=['POST'])
def connect_account_route():
    global campaign_state
    data = request.json or {}
    account_id = data.get("account_id", "default")
    campaign_state["account_id"] = account_id
    
    # Place connect command in the worker queue
    command_queue.put({'type': 'connect', 'account_id': account_id})
    return jsonify({"status": "success", "message": "Connection initiated. Browser opening..."})

@app.route('/get-attachment-filename', methods=['GET'])
def get_attachment_filename():
    file_path, _ = _find_attachment_in_shared_folder()
    if file_path:
        return jsonify({"status": "success", "filename": os.path.basename(file_path)})
    else:
        return jsonify({"status": "error", "filename": None, "message": "No file found in ~/Downloads/Attach folder."})

@app.route('/launch-campaign', methods=['POST'])
def launch_campaign():
    global campaign_state
    if campaign_state["is_running"]:
        return jsonify({"status": "error", "message": "Another campaign is already running."}), 400
    
    data = request.json
    campaign_id = data.get("id")
    
    # Trigger campaign execution via queue
    command_queue.put({'type': 'launch', 'data': data})
    return jsonify({"status": "success", "message": "Campaign queued for launch."})

@app.route('/control-campaign', methods=['POST'])
def control_campaign():
    global campaign_state
    action = request.json.get("action")
    msg = ""
    if action == "pause":
        if campaign_state["is_running"]:
            campaign_state["is_paused"] = True; msg = "Campaign paused by user."
        else: return jsonify({"status": "error", "message": "No campaign running."}), 400
    elif action == "resume":
        if campaign_state["is_running"]:
            campaign_state["is_paused"] = False; msg = "Campaign resumed by user."
        else: return jsonify({"status": "error", "message": "No campaign running to resume."}), 400
    elif action == "stop":
        if campaign_state["is_running"] or campaign_state["campaign_id"]:
            stopped_id = campaign_state["campaign_id"]
            campaign_state["is_running"] = False
            msg = f"Campaign '{stopped_id}' stopped by user."
        else: return jsonify({"status": "error", "message": "No campaign running to stop."}), 400
    else: return jsonify({"status": "error", "message": "Invalid action."}), 400
    _log_event(msg, 'system')
    return jsonify({"status": "success", "message": msg})

@app.route('/clear-logs', methods=['POST'])
def clear_logs():
    global campaign_state
    campaign_state["campaign_logs"] = []
    campaign_state["sent_count"] = 0
    campaign_state["failed_count"] = 0
    _log_event("Campaign logs and counts cleared.", 'system')
    return jsonify({"status": "success", "message": "Local campaign logs and counts cleared."})

def _wait_for_send_window_local_agent(start_str, end_str):
    if not start_str or not end_str:
        return
    while True:
        if not campaign_state["is_running"]:
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
            _log_event(f"Currently outside active send window ({start_str} - {end_str}). Waiting...", 'system')
        except Exception as e:
            _log_event(f"Send window error: {e}", 'system')
            break
            
        for _ in range(60):
            if not campaign_state["is_running"] or campaign_state["is_paused"]:
                return
            time.sleep(0.5)

# --- Background Worker Thread Logic ---
def _run_campaign_synchronously(data):

    global campaign_state
    campaign_id = data.get("id")
    _log_event(f"Campaign '{campaign_id}' launch sequence initiated.", 'system')
    
    attachment_path_to_use = None
    if data.get("useAttachmentFromFolder"):
        found_path, status_msg = _find_attachment_in_shared_folder()
        if not found_path:
            _log_event(f"Campaign launch aborted. Attachment error: {status_msg}", 'system')
            campaign_state["is_running"] = False
            return
        attachment_path_to_use = found_path

    campaign_state.update({
        "campaign_id": campaign_id, "is_running": True, "is_paused": False,
        "sent_count": 0, "failed_count": 0, "current_index": 0,
        "campaign_logs": [],
        "contacts": data.get("contacts", []),
        "message_template": data.get("message", ""),
        "attachment_path": attachment_path_to_use,
        "send_as_caption": data.get("sendAsCaption", False),
        "global_placeholders": data.get("globalPlaceholders", []),
        "settings": {
            "messageDelayMin": data.get("messageDelayMin", 1),
            "messageDelayMax": data.get("messageDelayMax", 2),
            "batchSize": data.get("batchSize"),
            "batchDelayMin": data.get("batchDelayMin"),
            "batchDelayMax": data.get("batchDelayMax"),
            "pacingMessagesPerHour": data.get("pacingMessagesPerHour"),
            "staggerDurationHours": data.get("staggerDurationHours"),
            "sendWindowStart": data.get("sendWindowStart"),
            "sendWindowEnd": data.get("sendWindowEnd"),
            "warmUpMode": data.get("warmUpMode"),
            "detectOptOut": data.get("detectOptOut"),
        },
    })

    
    account_id = data.get("accountId") or data.get("account_id") or campaign_state.get("account_id") or "default"
    campaign_state["account_id"] = account_id
    if not page or page.is_closed():
        _log_event("Browser not active. Attempting to start standard browser session...", 'system')
        # Re-trigger connection synchronously on this thread
        _connect_standard_browser_sync(account_id)
        
    if not page or page.is_closed():
        _log_event("Campaign launch failed: Unable to initialize standard browser page context.", 'system')
        campaign_state["is_running"] = False
        campaign_state["campaign_id"] = None
        return

    _log_event(f"Campaign '{campaign_id}' started running.", 'system')
    
    while campaign_state["current_index"] < len(campaign_state["contacts"]):
        # 1. Check active send window
        send_window_start = campaign_state["settings"].get("sendWindowStart")
        send_window_end = campaign_state["settings"].get("sendWindowEnd")
        if send_window_start and send_window_end:
            _wait_for_send_window_local_agent(send_window_start, send_window_end)

        # 2. Check network connecting/offline banner
        _check_network_and_wait(page, log_func=lambda msg: _log_event(msg, 'system'))

        # 3. Warm-Up Mode check
        if campaign_state["settings"].get("warmUpMode") and account_id != "default":
            limit_reached, sent_today, daily_limit = _check_warm_up_limit_local(account_id)
            if limit_reached:
                _log_event(f"Warm-Up daily limit reached ({sent_today}/{daily_limit} messages). Pausing campaign.", 'system')
                campaign_state["is_paused"] = True
                while limit_reached and campaign_state["is_paused"] and campaign_state["is_running"]:
                    time.sleep(10)
                    limit_reached, sent_today, daily_limit = _check_warm_up_limit_local(account_id)
                continue

        if not campaign_state["is_running"]:
            _log_event("Campaign stopped.", 'system')
            break
        if campaign_state["is_paused"]:
            time.sleep(1)
            continue

        if random.random() < 0.05: _simulate_idle_activity()

        contact = campaign_state["contacts"][campaign_state["current_index"]]
        number = contact.get('number')
        attachment_to_send = campaign_state.get("attachment_path")
        send_as_caption_flag = campaign_state.get("send_as_caption", False)
        message_template = campaign_state.get("message_template", "")
        final_text_to_send = process_message_for_contact(message_template, contact, campaign_state["global_placeholders"])
        
        log_preview = (final_text_to_send.split('\\n')[0][:30] + '...') if final_text_to_send else ""
        if attachment_to_send:
            log_preview = f"[{os.path.basename(attachment_to_send)}] {log_preview}".strip()

        _log_event(f"Preparing to send to {number}...", 'system')
        success, status_text = send_whatsapp_message(
            number, final_text_to_send, attachment_to_send, send_as_caption_flag,
            detect_opt_out=campaign_state["settings"].get("detectOptOut", False)
        )

        if success:
            campaign_state["sent_count"] += 1
            _log_event(f"SUCCESS: Message sent to {number}", 'campaign', data={"status": "Sent", "number": number, "message_preview": log_preview})
        else:
            campaign_state["failed_count"] += 1
            _log_event(f"FAIL: Message to {number}. Reason: {status_text}", 'campaign', data={"status": "Failed", "number": number, "message_preview": status_text[:30] + '...'})

        # Handle Session Expiry abort
        if not success and status_text == "Session expired":
            _log_event("Session expired. Stopping campaign worker.", 'system')
            campaign_state["is_running"] = False
            break

        campaign_state["current_index"] += 1
        
        if campaign_state["is_running"] and campaign_state["current_index"] < len(campaign_state["contacts"]):
            # Check for batch size & delay
            batch_size = campaign_state["settings"].get("batchSize")
            batch_delay_min = campaign_state["settings"].get("batchDelayMin")
            batch_delay_max = campaign_state["settings"].get("batchDelayMax")
            is_batch_cooldown = False
            
            if batch_size and batch_delay_min and batch_delay_max and campaign_state["current_index"] % batch_size == 0:
                is_batch_cooldown = True
                batch_delay = random.uniform(batch_delay_min, batch_delay_max)
                _log_event(f"Reached batch size {batch_size}. Pausing for batch delay of {batch_delay:.1f} seconds...", 'system')
                total_delay = batch_delay
            else:
                # Periodic Human Break ("Coffee Break") - every 5 to 9 messages
                if campaign_state["current_index"] % random.randint(5, 9) == 0:
                    break_duration = random.uniform(15.0, 35.0)
                    _log_event(f"Simulating human pause (coffee break) for {break_duration:.1f} seconds to avoid detection...", 'system')
                    time.sleep(break_duration)
                    
                # Calculate dynamic message-length and attachment size delay scaling
                word_count = len(final_text_to_send.split()) if final_text_to_send else 0
                file_size_mb = 0
                if attachment_to_send and os.path.exists(attachment_to_send):
                    try:
                        file_size_mb = os.path.getsize(attachment_to_send) / (1024.0 * 1024.0)
                    except:
                        pass
                extra_delay = (word_count * 0.08) + (file_size_mb * 1.5)

                min_delay = campaign_state["settings"].get("messageDelayMin", 1)
                max_delay = campaign_state["settings"].get("messageDelayMax", 2)
                avg_delay = (min_delay + max_delay) / 2
                std_dev = max((max_delay - min_delay) / 4, 0.1)
                delay = max(min_delay, random.gauss(avg_delay, std_dev))
                delay = min(delay, max_delay * 2)
                total_delay = delay + extra_delay

            # Pacing & Stagger calculations
            pacing_messages_per_hour = campaign_state["settings"].get("pacingMessagesPerHour")
            stagger_duration_hours = campaign_state["settings"].get("staggerDurationHours")
            if stagger_duration_hours and not pacing_messages_per_hour:
                pacing_messages_per_hour = max(1, int(len(campaign_state["contacts"]) / stagger_duration_hours))
            
            if pacing_messages_per_hour and not is_batch_cooldown:
                pacing_interval = 3600.0 / pacing_messages_per_hour
                if total_delay < pacing_interval:
                    total_delay = pacing_interval

            _log_event(f"Cooldown for {total_delay:.1f} seconds...", 'system')
            # Sleep in small increments to remain responsive to stop/pause signals
            for _ in range(int(total_delay * 2)):
                if not campaign_state["is_running"] or campaign_state["is_paused"]:
                    break
                time.sleep(0.5)



    _log_event(f"Campaign '{campaign_id}' finished.", 'system')
    campaign_state["is_running"] = False

def _connect_standard_browser_sync(account_id):
    global playwright_instance, browser_context, page, playwright_thread_id
    try:
        # Recreate context safely
        if browser_context:
            try: browser_context.close()
            except: pass
            browser_context = None
            page = None
            
        workspace_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..")) if os.path.basename(os.path.abspath(os.path.dirname(__file__))) == '.playwright-mcp' else os.path.abspath(os.path.dirname(__file__))
        data_dir = os.path.join(workspace_dir, "novasend_ghost_data", "accounts", str(account_id))
        os.makedirs(data_dir, exist_ok=True)
        
        default_channel = _get_default_browser_channel()
        headless_mode = os.environ.get("HEADLESS", "false").lower() == "true"
        _log_event(f"Agent Worker: Opening browser (channel={default_channel}, headless={headless_mode}) for account {account_id}...", 'system')
        browser_context = playwright_instance.chromium.launch_persistent_context(
            user_data_dir=data_dir,
            channel=default_channel,
            headless=headless_mode,
            user_agent=STEALTH_USER_AGENT,
            ignore_default_args=['--enable-automation', '--no-sandbox'],
            args=[
                '--no-first-run',
                '--no-default-browser-check',
                '--disable-blink-features=AutomationControlled',
                '--start-maximized',
            ],
            no_viewport=True,
        )

        
        # Inject anti-detection JavaScript into every new page
        browser_context.add_init_script(ANTI_DETECTION_SCRIPT)
        
        page = browser_context.pages[0] if browser_context.pages else browser_context.new_page()
        if STEALTH_AVAILABLE:
            stealth_sync(page)

        page.goto("https://web.whatsapp.com", wait_until='domcontentloaded')
    except Exception as ex:
        _log_event(f"Browser sync connection failed: {ex}", 'system')
        page = None
        try:
            _increment_account_metric(int(account_id), 'browser_crashes')
        except:
            pass

# --- Main Playwright Thread Loop ---
def agent_worker():
    global playwright_instance, browser_context, page, playwright_thread_id
    _log_event("Agent Worker: Initializing Playwright system...", 'system')
    try:
        pw = sync_playwright().start()
        playwright_instance = pw
        playwright_thread_id = threading.get_ident()
        _log_event("Agent Worker: Playwright initialized successfully.", 'system')
    except Exception as e:
        _log_event(f"Agent Worker: Playwright failed to initialize: {e}", 'system')
        return

    last_status_check = 0
    
    while True:
        try:
            # Check for commands
            try:
                cmd = command_queue.get(timeout=0.5)
            except queue.Empty:
                cmd = None
                
            if cmd:
                cmd_type = cmd.get('type')
                if cmd_type == 'connect':
                    account_id = cmd.get('account_id', 'default')
                    _log_event(f"Agent Worker: Connect command received for account {account_id}.", 'system')
                    _connect_standard_browser_sync(account_id)
                elif cmd_type == 'launch':
                    _run_campaign_synchronously(cmd.get('data'))
                    
            # Update connection status
            now = time.time()
            if now - last_status_check >= 2.0:
                last_status_check = now
                if page and not page.is_closed():
                    campaign_state["is_connected"] = check_page_logged_in()
                else:
                    campaign_state["is_connected"] = False
        except Exception as e:
            _log_event(f"Agent Worker Loop Error: {e}", 'system')
            time.sleep(1)

# --- Start Worker Thread ---
worker_thread = threading.Thread(target=agent_worker, daemon=True)
worker_thread.start()

# --- Main Execution Block ---
if __name__ == '__main__':
    logging.info("Flask server starting on http://127.0.0.1:5001")
    try:
        app.run(host='127.0.0.1', port=5001)
    finally:
        if browser_context:
            try: browser_context.close()
            except: pass
        if playwright_instance:
            try: playwright_instance.stop()
            except: pass
`;

const CodeBlock: React.FC<{ command: string }> = ({ command }) => {
    const { showNotification } = useAppContext();
    const handleCopy = () => {
        navigator.clipboard.writeText(command);
        showNotification({ message: 'Command copied to clipboard!', type: 'info' });
    };

    return (
        <div className="bg-gray-900 rounded-lg p-4 flex items-center justify-between font-mono text-sm text-gray-300">
            <code>{command}</code>
            <button onClick={handleCopy} className="text-gray-400 hover:text-white">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
            </button>
        </div>
    );
};

const Settings: React.FC = () => {
    const { palette, setPalette, gradients, globalPlaceholders, setGlobalPlaceholders, showNotification } = useAppContext();
    const [webhookUrl, setWebhookUrl] = useState('https://api.novasend.app/webhook/wHk_sAmPlE_tOkeN_12345');
    const [newPlaceholder, setNewPlaceholder] = useState({ key: '', value: '' });

    const handleAddPlaceholder = () => {
        if (newPlaceholder.key && newPlaceholder.value && !globalPlaceholders.some(p => p.key === newPlaceholder.key)) {
            const placeholder: GlobalPlaceholder = {
                id: `ph_${Date.now()}`,
                key: newPlaceholder.key.replace(/\s+/g, '_'),
                value: newPlaceholder.value,
            };
            setGlobalPlaceholders(prev => [...prev, placeholder]);
            setNewPlaceholder({ key: '', value: '' });
        }
    };
    
    const handleRemovePlaceholder = (id: string) => {
        setGlobalPlaceholders(prev => prev.filter(p => p.id !== id));
    };

    const handleDownloadScript = () => {
        try {
            const blob = new Blob([pythonScriptContent], { type: 'text/x-python;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'novasend.py';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            showNotification({ message: "Agent script downloaded.", type: 'success' });
        } catch (error) {
            console.error("Download failed:", error);
            showNotification({ message: "Could not create the download link for the script.", type: 'error' });
        }
    };

    return (
        <div className="max-w-4xl mx-auto space-y-8">
            <Card title="Local Automation Agent">
                <p className="text-gray-500 dark:text-gray-400 mb-4">
                    For full automation, NovaSend uses a secure local Python agent that runs on your computer. Follow these steps to set it up.
                </p>
                <div className="space-y-4">
                    <div>
                        <h4 className="font-semibold">1. Install Python</h4>
                        <p className="text-sm text-gray-500 dark:text-gray-400">If you don't have Python, download the latest version from the official website.</p>
                        <a href="https://www.python.org/downloads/" target="_blank" rel="noopener noreferrer">
                            <Button variant="secondary" className="mt-2 !bg-cyan-600 hover:!bg-cyan-700 !text-white">Visit python.org</Button>
                        </a>
                    </div>
                     <div>
                        <h4 className="font-semibold">2. Download the Agent Script</h4>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Get the required <code>novasend.py</code> file. This script uses <strong>Playwright</strong> for reliable, modern browser automation.</p>
                        <Button variant="secondary" icon={<DownloadIcon />} className="mt-2 !bg-cyan-600 hover:!bg-cyan-700 !text-white" onClick={handleDownloadScript}>Download Script</Button>
                    </div>
                    <div>
                        <h4 className="font-semibold">3. Install Required Libraries</h4>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Open your command prompt (CMD) or terminal, and run the following commands to install the necessary packages and set up the browser.</p>
                        <CodeBlock command="pip install Flask Flask-Cors playwright playwright-stealth" />
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">After installing the packages, install the Chromium browser for Playwright:</p>
                        <CodeBlock command="playwright install chromium" />
                    </div>
                     <div>
                        <h4 className="font-semibold">4. Run the Agent</h4>
                        <p className="text-sm text-gray-500 dark:text-gray-400">In the same terminal, navigate to the folder where you saved <code>novasend.py</code> and execute it with this command.</p>
                        <CodeBlock command="python novasend.py" />
                         <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                            A Chromium window will open. Scan the WhatsApp Web QR code if prompted. The agent will create a <code>novasend_ghost_data</code> folder to save your login session, reducing future QR scans.
                        </p>
                    </div>
                    <div className="p-4 bg-red-50 dark:bg-red-500/10 border-l-4 border-red-400 dark:border-red-500 rounded-r-lg">
                        <h4 className="font-bold text-red-800 dark:text-red-200">Important Note</h4>
                        <p className="text-red-700 dark:text-red-300">The terminal window running the agent script must remain open for the application to function. Closing this window will terminate the agent and disconnect it from this web interface.</p>
                    </div>
                </div>
            </Card>

            <Card title="Chroma-Flow Theme">
                <p className="text-gray-500 dark:text-gray-400 mb-4">Select your preferred gradient palette.</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {Object.keys(gradients).map(key => {
                        const p = key as GradientPalette;
                        const g = gradients[p];
                        const isSelected = palette === p;
                        return (
                            <div key={p} onClick={() => setPalette(p)} className={`p-4 rounded-lg cursor-pointer border-2 transition-all ${isSelected ? 'border-[var(--gradient-via)]' : 'border-gray-200 dark:border-gray-700'}`}>
                                <div
                                    className="h-16 rounded-md bg-gradient-to-r"
                                    style={{ background: `linear-gradient(to right, ${g.from}, ${g.via}, ${g.to})`}}
                                ></div>
                                <p className="mt-2 font-semibold text-center">{g.name}</p>
                            </div>
                        );
                    })}
                </div>
            </Card>

            <Card title="Global Placeholders">
                <p className="text-gray-500 dark:text-gray-400 mb-4">{'Define reusable text snippets for your campaigns. Use them in your messages like `{{your_key}}`.'}</p>
                <div className="space-y-2 mb-4">
                    {globalPlaceholders.map(p => (
                        <div key={p.id} className="flex items-center space-x-2 p-2 rounded-lg bg-gray-100 dark:bg-gray-700/50">
                            <span className="font-mono text-sm text-blue-500 dark:text-blue-400">{`{{${p.key}}}`}</span>
                            <span className="text-gray-500 dark:text-gray-400">{'→'}</span>
                            <span className="flex-1 text-sm text-gray-800 dark:text-gray-200">{p.value}</span>
                            <button onClick={() => handleRemovePlaceholder(p.id)} className="p-1.5 text-red-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-500/10 rounded-full transition-colors"><TrashIcon className="w-4 h-4"/></button>
                        </div>
                    ))}
                </div>
                <div className="flex items-center space-x-2 p-2 rounded-lg bg-gray-100 dark:bg-gray-900 border border-gray-200 dark:border-gray-700">
                    <input
                        type="text"
                        placeholder="your_key"
                        value={newPlaceholder.key}
                        onChange={(e) => setNewPlaceholder(p => ({ ...p, key: e.target.value }))}
                        className="w-1/3 bg-transparent font-mono text-sm focus:outline-none"
                    />
                     <input
                        type="text"
                        placeholder="Your Value"
                        value={newPlaceholder.value}
                        onChange={(e) => setNewPlaceholder(p => ({ ...p, value: e.target.value }))}
                        className="flex-1 bg-transparent text-sm focus:outline-none"
                    />
                    <Button variant="secondary" onClick={handleAddPlaceholder}>Add</Button>
                </div>
            </Card>

            <Card title="Webhook Integration">
                <p className="text-gray-500 dark:text-gray-400 mb-4">Trigger messages from your other applications using a unique webhook URL.</p>
                <div className="flex items-center space-x-2 p-2 rounded-lg bg-gray-100 dark:bg-gray-900 border border-gray-200 dark:border-gray-700">
                    <input
                        type="text"
                        readOnly
                        value={webhookUrl}
                        className="flex-1 bg-transparent font-mono text-sm focus:outline-none"
                    />
                    <Button variant="secondary" onClick={() => navigator.clipboard.writeText(webhookUrl)}>Copy</Button>
                </div>
                 <Button variant="primary" className="mt-4">Generate New URL</Button>
            </Card>
        </div>
    );
};

export default Settings;