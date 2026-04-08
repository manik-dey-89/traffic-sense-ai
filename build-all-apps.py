#!/usr/bin/env python3
"""
TrafficSense AI - Universal App Builder
======================================

Builds desktop and mobile apps for all platforms
"""

import os
import sys
import subprocess
import shutil
from pathlib import Path

class AppBuilder:
    def __init__(self):
        self.root_dir = Path(__file__).parent
        self.desktop_dir = self.root_dir / "desktop"
        self.mobile_dir = self.root_dir / "mobile"
        self.frontend_dir = self.root_dir / "frontend"
        
    def print_banner(self):
        print("🚀 TrafficSense AI - Universal App Builder")
        print("=" * 50)
        print("Building Desktop & Mobile Apps...")
        print()
        
    def check_dependencies(self):
        print("🔍 Checking dependencies...")
        
        # Check Node.js
        try:
            result = subprocess.run(['node', '--version'], capture_output=True, text=True)
            if result.returncode == 0:
                print(f"✅ Node.js: {result.stdout.strip()}")
            else:
                print("❌ Node.js not found. Please install Node.js")
                return False
        except FileNotFoundError:
            print("❌ Node.js not found. Please install Node.js")
            return False
            
        # Check Python
        try:
            result = subprocess.run(['python', '--version'], capture_output=True, text=True)
            if result.returncode == 0:
                print(f"✅ Python: {result.stdout.strip()}")
            else:
                print("❌ Python not found. Please install Python 3.7+")
                return False
        except FileNotFoundError:
            print("❌ Python not found. Please install Python 3.7+")
            return False
            
        return True
        
    def create_app_icons(self):
        print("🎨 Creating app icons...")
        
        icon_dir = self.root_dir / "icons"
        icon_dir.mkdir(exist_ok=True)
        
        # Create icon placeholder (you should replace with actual icon files)
        icon_sizes = {
            "icon-16.png": 16,
            "icon-32.png": 32,
            "icon-64.png": 64,
            "icon-128.png": 128,
            "icon-256.png": 256,
            "icon-512.png": 512
        }
        
        for icon_file, size in icon_sizes.items():
            icon_path = icon_dir / icon_file
            if not icon_path.exists():
                print(f"⚠️  Please create {icon_file} ({size}x{size})")
                
        # Copy main icon to desktop and mobile folders
        main_icon = icon_dir / "icon-256.png"
        if main_icon.exists():
            shutil.copy(main_icon, self.desktop_dir / "icon.png")
            shutil.copy(main_icon, self.mobile_dir / "icon.png")
            print("✅ Icons copied to app folders")
        else:
            print("⚠️  Please create icon-256.png")
            
    def build_desktop_app(self):
        print("🖥️  Building Desktop App...")
        
        os.chdir(self.desktop_dir)
        
        # Install dependencies
        print("   Installing Electron dependencies...")
        result = subprocess.run(['npm', 'install'], capture_output=True, text=True)
        if result.returncode != 0:
            print(f"❌ npm install failed: {result.stderr}")
            return False
            
        # Build for current platform
        print("   Building desktop app...")
        result = subprocess.run(['npm', 'run', 'build'], capture_output=True, text=True)
        if result.returncode != 0:
            print(f"❌ Desktop build failed: {result.stderr}")
            return False
            
        print("✅ Desktop app built successfully!")
        return True
        
    def build_mobile_app(self):
        print("📱 Building Mobile App...")
        
        os.chdir(self.mobile_dir)
        
        # Install dependencies
        print("   Installing Capacitor dependencies...")
        result = subprocess.run(['npm', 'install'], capture_output=True, text=True)
        if result.returncode != 0:
            print(f"❌ npm install failed: {result.stderr}")
            return False
            
        # Initialize Capacitor if not already done
        if not (self.mobile_dir / "android").exists():
            print("   Initializing Android project...")
            result = subprocess.run(['npx', 'cap', 'init', 'TrafficSense AI', 'com.trafficsense.ai'], 
                                  capture_output=True, text=True)
            if result.returncode != 0:
                print(f"❌ Capacitor init failed: {result.stderr}")
                return False
                
        # Sync project
        print("   Syncing mobile project...")
        result = subprocess.run(['npx', 'cap', 'sync', 'android'], capture_output=True, text=True)
        if result.returncode != 0:
            print(f"❌ Capacitor sync failed: {result.stderr}")
            return False
            
        print("✅ Mobile app prepared successfully!")
        print("   To build APK: npx cap open android")
        return True
        
    def create_installer_scripts(self):
        print("📦 Creating installer scripts...")
        
        # Windows installer script
        win_script = self.root_dir / "build-windows.bat"
        with open(win_script, 'w') as f:
            f.write('''@echo off
echo Building TrafficSense AI for Windows...
cd /d "%~dp0desktop"
call npm install
call npm run build-win
echo Windows app built in dist/ folder
pause
''')
            
        # Linux installer script
        linux_script = self.root_dir / "build-linux.sh"
        with open(linux_script, 'w') as f:
            f.write('''#!/bin/bash
echo "Building TrafficSense AI for Linux..."
cd "$(dirname "$0")/desktop"
npm install
npm run build-linux
echo "Linux app built in dist/ folder"
''')
        linux_script.chmod(0o755)
        
        # Android build script
        android_script = self.root_dir / "build-android.sh"
        with open(android_script, 'w') as f:
            f.write('''#!/bin/bash
echo "Building TrafficSense AI for Android..."
cd "$(dirname "$0")/mobile"
npm install
npx cap sync android
npx cap open android
echo "Android Studio opened - build APK from there"
''')
        android_script.chmod(0o755)
        
        print("✅ Installer scripts created!")
        
    def build_all(self):
        self.print_banner()
        
        if not self.check_dependencies():
            print("❌ Please install missing dependencies and try again")
            return False
            
        self.create_app_icons()
        
        print("\n🏗️  Starting build process...")
        
        success = True
        
        # Build desktop
        if not self.build_desktop_app():
            success = False
            
        # Build mobile
        if not self.build_mobile_app():
            success = False
            
        # Create installer scripts
        self.create_installer_scripts()
        
        if success:
            print("\n🎉 Build completed successfully!")
            print("\n📂 Output directories:")
            print(f"   Desktop: {self.desktop_dir}/dist/")
            print(f"   Mobile:  {self.mobile_dir}/android/")
            print("\n🚀 To run apps:")
            print("   Desktop: Run installer from dist/ folder")
            print("   Mobile:  Open Android Studio and build APK")
        else:
            print("\n❌ Build failed. Check errors above.")
            
        return success

if __name__ == "__main__":
    builder = AppBuilder()
    success = builder.build_all()
    sys.exit(0 if success else 1)
