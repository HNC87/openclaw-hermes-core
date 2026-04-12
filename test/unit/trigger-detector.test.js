/**
 * TriggerDetector Unit Tests
 *
 * Tests for the self-learning trigger detection logic.
 */

import { TriggerDetector } from '../../src/learning/trigger-detector.js';

describe('TriggerDetector', () => {
  let detector;

  beforeEach(() => {
    detector = new TriggerDetector(5);
  });

  describe('initialization', () => {
    test('should initialize with default minToolCalls of 5', () => {
      const d = new TriggerDetector();
      expect(d.toolCallCount).toBe(0);
    });

    test('should accept custom minToolCalls', () => {
      const d = new TriggerDetector(10);
      expect(d.toolCallCount).toBe(0);
    });
  });

  describe('onToolCall', () => {
    test('should increment tool call count', () => {
      detector.onToolCall('bash');
      expect(detector.toolCallCount).toBe(1);
    });

    test('should track tool names', () => {
      detector.onToolCall('bash');
      detector.onToolCall('read_file');
      expect(detector.getState().toolNames).toEqual(['bash', 'read_file']);
    });

    test('should accumulate multiple tool calls', () => {
      for (let i = 0; i < 5; i++) {
        detector.onToolCall(`tool${i}`);
      }
      expect(detector.toolCallCount).toBe(5);
    });
  });

  describe('onToolError', () => {
    test('should set hasError flag', () => {
      detector.onToolError('File not found');
      expect(detector.getState().hasError).toBe(true);
    });

    test('should store error message', () => {
      detector.onToolError('Permission denied');
      expect(detector.getState().lastError).toBe('Permission denied');
    });

    test('should reset consecutiveSuccess', () => {
      detector.onToolSuccess();
      detector.onToolSuccess();
      detector.onToolError('Error');
      expect(detector.getState().consecutiveSuccess).toBe(0);
    });
  });

  describe('onToolSuccess', () => {
    test('should increment consecutiveSuccess', () => {
      detector.onToolSuccess();
      expect(detector.getState().consecutiveSuccess).toBe(1);
    });

    test('should set recoveredFromError if error occurred before', () => {
      detector.onToolError('Previous error');
      detector.onToolSuccess();
      expect(detector.getState().recoveredFromError).toBe(true);
    });
  });

  describe('onUserCorrection', () => {
    test('should set recoveredFromError flag', () => {
      detector.onUserCorrection();
      expect(detector.getState().recoveredFromError).toBe(true);
    });
  });

  describe('shouldTriggerSkillGeneration', () => {
    describe('trigger type: high_tool_usage', () => {
      test('should trigger when tool calls >= minToolCalls', () => {
        for (let i = 0; i < 5; i++) {
          detector.onToolCall(`tool${i}`);
        }
        const result = detector.shouldTriggerSkillGeneration();
        expect(result.shouldTrigger).toBe(true);
        expect(result.triggerType).toBe('high_tool_usage');
        expect(result.reason).toContain('5 tool calls');
      });

      test('should not trigger below threshold', () => {
        for (let i = 0; i < 4; i++) {
          detector.onToolCall(`tool${i}`);
        }
        const result = detector.shouldTriggerSkillGeneration();
        expect(result.shouldTrigger).toBe(false);
      });
    });

    describe('trigger type: error_recovery', () => {
      test('should trigger when recovered from error', () => {
        detector.onToolError('Some error');
        detector.onToolSuccess();
        const result = detector.shouldTriggerSkillGeneration();
        expect(result.shouldTrigger).toBe(true);
        expect(result.triggerType).toBe('error_recovery');
        expect(result.reason).toContain('Recovered from error');
      });

      test('should not trigger if no recovery occurred', () => {
        detector.onToolError('Some error');
        // No success after error
        const result = detector.shouldTriggerSkillGeneration();
        expect(result.shouldTrigger).toBe(false);
      });
    });

    describe('trigger type: non_trivial_workflow', () => {
      test('should trigger for 5+ consecutive successes with 3+ tool calls', () => {
        for (let i = 0; i < 5; i++) {
          detector.onToolSuccess();
        }
        detector.onToolCall('tool1');
        detector.onToolCall('tool2');
        detector.onToolCall('tool3');
        const result = detector.shouldTriggerSkillGeneration();
        expect(result.shouldTrigger).toBe(true);
        expect(result.triggerType).toBe('non_trivial_workflow');
      });
    });
  });

  describe('reset', () => {
    test('should clear all state', () => {
      detector.onToolCall('tool1');
      detector.onToolError('error');
      detector.onToolSuccess();
      detector.reset();

      const state = detector.getState();
      expect(state.toolCallCount).toBe(0);
      expect(state.hasError).toBe(false);
      expect(state.recoveredFromError).toBe(false);
      expect(state.consecutiveSuccess).toBe(0);
      expect(state.toolNames).toEqual([]);
    });
  });
});
