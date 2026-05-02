#!/usr/bin/env python3
"""
Kingdom Magic: The Dragon's Fortress - Main System
Escape room game engine with hardware integration and web interface.
"""

import sys
import os
import signal
import logging
from threading import Thread
import time
import yaml

# Add project root to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from web_interface.app import app, socketio, game_manager
from game_engine.devices.hardware_interface import HardwareManager

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class EscapeRoomSystem:
    def __init__(self, config_path="config/game_config.yaml"):
        self.config_path = config_path
        self.config = self.load_config()
        self.hardware_manager = None
        self.web_thread = None
        self.running = False
        
    def load_config(self):
        """Load configuration file"""
        with open(self.config_path, 'r') as f:
            return yaml.safe_load(f)
    
    def setup_hardware(self):
        """Initialize hardware interfaces"""
        logger.info("Initializing hardware interfaces...")
        
        hardware_config = self.config.get('HARDWARE', {})
        self.hardware_manager = HardwareManager(hardware_config)
        
        if self.hardware_manager.initialize():
            logger.info("Hardware interfaces initialized successfully")
            
            # Link hardware to game state
            self.link_hardware_to_game()
            
            # Start hardware monitoring thread
            hardware_thread = Thread(target=self.hardware_monitor_loop, daemon=True)
            hardware_thread.start()
            
            return True
        else:
            logger.warning("Hardware initialization failed. Running in simulation mode.")
            return False
    
    def link_hardware_to_game(self):
        """Link hardware events to game state updates"""
        if self.hardware_manager:
            self.hardware_manager.register_game_state(game_manager.state)
        logger.info("Hardware events linked to game state")
    
    def hardware_monitor_loop(self):
        """Monitor hardware status and update game state"""
        logger.info("Starting hardware monitor loop")
        
        while self.running and self.hardware_manager and self.hardware_manager.initialized:
            try:
                # Check each room's hardware status
                for room_id, controller in self.hardware_manager.controllers.items():
                    # Here we would check sensors and update game state
                    # For now, just keep connection alive
                    pass
                
                time.sleep(1)
            except Exception as e:
                logger.error(f"Error in hardware monitor loop: {e}")
                time.sleep(5)
    
    def start_web_interface(self):
        """Start the Flask web interface"""
        logger.info("Starting web interface...")
        
        web_config = self.config.get('WEB', {})
        host = web_config.get('host', '0.0.0.0')
        port = web_config.get('port', 5000)
        debug = web_config.get('debug', False)
        
        # Run in a separate thread
        self.web_thread = Thread(
            target=lambda: socketio.run(app, host=host, port=port, debug=debug, use_reloader=False),
            daemon=True
        )
        self.web_thread.start()
        
        logger.info(f"Web interface started on http://{host}:{port}")
    
    def start(self):
        """Start the entire system"""
        logger.info("Starting Escape Room System...")
        self.running = True
        
        # Setup signal handlers for graceful shutdown
        signal.signal(signal.SIGINT, self.signal_handler)
        signal.signal(signal.SIGTERM, self.signal_handler)
        
        # Initialize hardware
        hardware_ok = self.setup_hardware()
        
        if not hardware_ok:
            logger.info("Running in simulation mode (no hardware)")
        
        # Start web interface
        self.start_web_interface()
        
        logger.info("System started successfully!")
        logger.info("Press Ctrl+C to stop")
        
        # Keep main thread alive
        try:
            while self.running:
                time.sleep(1)
        except KeyboardInterrupt:
            self.stop()
    
    def stop(self):
        """Stop the system"""
        logger.info("Stopping Escape Room System...")
        self.running = False
        
        if self.hardware_manager:
            self.hardware_manager.shutdown()
        
        logger.info("System stopped")
    
    def signal_handler(self, signum, frame):
        """Handle termination signals"""
        logger.info(f"Received signal {signum}, shutting down...")
        self.stop()
        sys.exit(0)

def main():
    """Main entry point"""
    print("""
    ╔══════════════════════════════════════════════════════════╗
    ║  Kingdom Magic: The Dragon's Fortress - Control System   ║
    ╚══════════════════════════════════════════════════════════╝
    """)
    
    # Check if config exists
    if not os.path.exists("config/game_config.yaml"):
        print("ERROR: Configuration file not found: config/game_config.yaml")
        print("Please create the configuration file first.")
        sys.exit(1)
    
    # Create system and start
    system = EscapeRoomSystem()
    system.start()

if __name__ == "__main__":
    main()
