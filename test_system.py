#!/usr/bin/env python3
"""Test script for Escape Room Game System."""

import json
import os
import sys
import tempfile

# Add project root to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from game_engine.game_state import GameStateManager, PuzzleStatus, RoomStatus


def test_game_state():
    """Validate trigger progression, room progression, hints, timer, and persistence."""
    print("Testing Game State Management...")

    manager = GameStateManager("config/game_config.yaml")
    state = manager.state

    assert state.current_room == "room1"
    assert state.rooms["room1"].status == RoomStatus.UNLOCKED
    assert state.rooms["room1"].door_locked is False
    assert state.rooms["room1"].puzzles["hidden_message"].status == PuzzleStatus.AVAILABLE
    assert state.rooms["room2"].status == RoomStatus.LOCKED
    assert state.rooms["room2"].puzzles["under_bed"].status == PuzzleStatus.LOCKED

    state.solve_puzzle("room1", "hidden_message")
    assert state.rooms["room1"].puzzles["hidden_message"].status == PuzzleStatus.SOLVED
    assert state.rooms["room1"].puzzles["cabinet_search"].status == PuzzleStatus.AVAILABLE
    assert "cabinet_search_available" in state.trigger_history

    room1_chain = [
        ("cabinet_search", "invisible_ink"),
        ("invisible_ink", "math_challenge"),
        ("math_challenge", "shower_mechanism"),
        ("shower_mechanism", "website_riddle"),
    ]
    for solved, unlocked in room1_chain:
        state.solve_puzzle("room1", solved)
        assert state.rooms["room1"].puzzles[unlocked].status == PuzzleStatus.AVAILABLE

    state.solve_puzzle("room1", "website_riddle")
    assert state.rooms["room1"].status == RoomStatus.COMPLETE
    assert state.rooms["room2"].door_locked is False
    assert state.rooms["room2"].status == RoomStatus.UNLOCKED
    assert state.current_room == "room2"
    assert state.rooms["room2"].puzzles["under_bed"].status == PuzzleStatus.AVAILABLE

    room2_chain = [
        ("under_bed", "number_lock"),
        ("number_lock", "jigsaw_puzzle"),
        ("jigsaw_puzzle", "password"),
    ]
    for solved, unlocked in room2_chain:
        state.solve_puzzle("room2", solved)
        assert state.rooms["room2"].puzzles[unlocked].status == PuzzleStatus.AVAILABLE

    state.solve_puzzle("room2", "password")
    assert state.rooms["room2"].status == RoomStatus.COMPLETE
    assert state.rooms["room3"].door_locked is False
    assert state.rooms["room3"].status == RoomStatus.UNLOCKED
    assert state.current_room == "room3"
    assert state.rooms["room3"].puzzles["mirror_clue"].status == PuzzleStatus.AVAILABLE

    room3_chain = [
        ("mirror_clue", "hidden_key"),
        ("hidden_key", "color_box"),
        ("color_box", "exit_door"),
    ]
    for solved, unlocked in room3_chain:
        state.solve_puzzle("room3", solved)
        assert state.rooms["room3"].puzzles[unlocked].status == PuzzleStatus.AVAILABLE

    state.solve_puzzle("room3", "exit_door")
    assert state.rooms["room3"].status == RoomStatus.COMPLETE
    assert state.game_complete is True
    assert state.end_time is not None

    hint_results = [state.use_hint() for _ in range(6)]
    assert hint_results == [True, True, True, True, True, False]
    assert state.hints_remaining == 0
    assert state.hints_used == 5

    state.start_game()
    state.update_time()
    assert state.start_time is not None
    assert state.time_remaining <= 90 * 60
    assert state.game_over is False
    
    timer_manager = GameStateManager("config/game_config.yaml")
    timer_state = timer_manager.state
    timer_state.start_game()
    assert timer_state.start_time is not None
    assert timer_state.game_over is False
    assert timer_state.game_complete is False
    
    import time
    from unittest.mock import patch
    original_start = timer_state.start_time
    with patch('game_engine.game_state.time.time', return_value=original_start + 2 * 60 * 60):
        timer_state.update_time()
        assert timer_state.time_remaining == 0
        assert timer_state.game_over is True

    with tempfile.NamedTemporaryFile(delete=False, suffix=".json") as tmp:
        save_path = tmp.name

    try:
        manager.save_state(save_path)
        with open(save_path, "r", encoding="utf-8") as file_obj:
            saved_data = json.load(file_obj)

        assert saved_data["game_complete"] is True
        assert "door_to_room2_unlock" in saved_data["trigger_history"]

        reloaded_manager = GameStateManager("config/game_config.yaml")
        reloaded_manager.load_state(save_path)
        reloaded_state = reloaded_manager.state

        assert reloaded_state.game_complete is True
        assert reloaded_state.rooms["room3"].puzzles["exit_door"].status == PuzzleStatus.SOLVED
        assert "game_complete" in reloaded_state.trigger_history
    finally:
        os.remove(save_path)

    print("Game state tests passed")


def test_web_interface():
    """Test core web API endpoints with assertions."""
    print("Testing Web Interface Components...")

    from web_interface.app import app, game_manager

    game_manager.state = game_manager.initialize_state()

    with app.test_client() as client:
        response = client.get('/api/game/state')
        assert response.status_code == 200
        body = response.get_json()
        assert body["current_room"] == "room1"

        response = client.post('/api/game/start')
        assert response.status_code == 200
        assert response.get_json()["success"] is True

        response = client.post('/api/game/hint')
        assert response.status_code == 200
        assert response.get_json()["hints_remaining"] == 4

        response = client.post('/api/puzzle/solve', json={'room_id': 'room1', 'puzzle_id': 'hidden_message'})
        assert response.status_code == 200
        assert response.get_json()["success"] is True
        assert game_manager.state.rooms["room1"].puzzles["cabinet_search"].status == PuzzleStatus.AVAILABLE

        response = client.post('/api/door/unlock', json={'room_id': 'room2'})
        assert response.status_code == 200
        assert game_manager.state.rooms["room2"].door_locked is False
        assert game_manager.state.current_room == "room2"

    print("Web interface tests passed")


def test_hardware_simulation():
    """Validate simulation callbacks update controller and game state."""
    print("Testing Hardware Simulation...")

    from game_engine.devices.hardware_interface import HardwareManager

    mock_config = {
        'serial_ports': {
            'room1': '/dev/ttyUSB0',
            'room2': '/dev/ttyUSB1',
            'room3': '/dev/ttyUSB2',
        },
        'baud_rate': 115200,
    }

    state_manager = GameStateManager("config/game_config.yaml")
    hardware_manager = HardwareManager(mock_config)
    hardware_manager.register_game_state(state_manager.state)

    initialized = hardware_manager.initialize()
    assert initialized is False

    simulated = hardware_manager.simulate_puzzle_solve("room1", "hidden_message")
    assert simulated is True
    assert state_manager.state.rooms["room1"].puzzles["hidden_message"].status == PuzzleStatus.SOLVED
    assert state_manager.state.rooms["room1"].puzzles["cabinet_search"].status == PuzzleStatus.AVAILABLE

    state_manager.state.unlock_door("room3")
    state_manager.state.rooms["room3"].puzzles["mirror_clue"].status = PuzzleStatus.SOLVED
    state_manager.state.rooms["room3"].puzzles["hidden_key"].status = PuzzleStatus.SOLVED
    state_manager.state.rooms["room3"].puzzles["color_box"].status = PuzzleStatus.AVAILABLE

    simulated = hardware_manager.simulate_puzzle_solve("room3", "color_box")
    room3_controller = hardware_manager.get_controller("room3")
    assert simulated is True
    assert room3_controller is not None
    assert room3_controller.exit_unlocked is True
    assert state_manager.state.rooms["room3"].puzzles["color_box"].status == PuzzleStatus.SOLVED
    assert state_manager.state.rooms["room3"].puzzles["exit_door"].status == PuzzleStatus.AVAILABLE

    print("Hardware simulation tests passed")


def main():
    """Run all tests."""
    print("=" * 60)
    print("Escape Room Game System - Test Suite")
    print("=" * 60)

    try:
        test_game_state()
        test_web_interface()
        test_hardware_simulation()
    except Exception as exc:
        print(f"\nERROR: Test failed with exception: {exc}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

    print("\n" + "=" * 60)
    print("All tests completed successfully!")
    print("=" * 60)


if __name__ == "__main__":
    main()
