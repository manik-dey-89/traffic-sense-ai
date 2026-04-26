#!/usr/bin/env python3
"""
TrafficSense AI - Mobile Server Launcher
========================================

This script starts the server with mobile-friendly settings.
"""

import sys
import os
import socket
import webbrowser

# Add backend to path so we can import app
sys.path.append(os.path.join(os.path.dirname(__file__), 'backend'))
from app import app

def get_local_ip():
    """Get the local IP address for mobile access"""
    try:
        # Connect to an external host to get local IP
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except:
        return "127.0.0.1"

def main():
    print("🚀 Starting TrafficSense AI Mobile Server...")
    print("=" * 50)
    
    # Get local IP
    local_ip = get_local_ip()
    
    print(f"📱 Mobile Access URLs:")
    print(f"   Local:   http://localhost:5000")
    print(f"   Network: http://{local_ip}:5000")
    print(f"   Mobile:  http://{local_ip}:5000")
    print()
    print("🔧 Server Configuration:")
    print("   ✅ Host: 0.0.0.0 (All interfaces)")
    print("   ✅ Port: 5000")
    print("   ✅ Debug: Enabled")
    print("   ✅ CORS: Enabled")
    print()
    print("📲 How to connect from mobile:")
    print("   1. Ensure phone and PC are on same WiFi")
    print("   2. Open browser on mobile")
    print("   3. Go to: http://{}".format(local_ip))
    print("   4. Add ':5000' if needed: http://{}:5000".format(local_ip))
    print()
    print("🌟 Mobile Features Available:")
    print("   ✅ Responsive Design")
    print("   ✅ Touch Gestures")
    print("   ✅ Geolocation")
    print("   ✅ Voice Assistant")
    print("   ✅ Install as App")
    print("   ✅ Offline Mode")
    print()
    print("⚠️  Firewall Note:")
    print("   If mobile can't connect, check Windows Firewall")
    print("   Allow Python/Flask through firewall for port 5000")
    print()
    print("🔄 Starting server...")
    print("=" * 50)
    
    # Start server
    try:
        app.run(
            host='0.0.0.0',  # Allow external connections
            port=5000,
            debug=True
        )
    except KeyboardInterrupt:
        print("\n🛑 Server stopped by user")
    except Exception as e:
        print(f"❌ Server error: {e}")
        print("\n🔧 Troubleshooting:")
        print("   1. Check if port 5000 is already in use")
        print("   2. Check firewall settings")
        print("   3. Try running as administrator")

if __name__ == '__main__':
    main()
