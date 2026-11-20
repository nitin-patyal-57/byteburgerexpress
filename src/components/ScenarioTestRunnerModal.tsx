import React, { useState } from 'react';
import { DIALOGUE_SCENARIOS } from '../core/dialogueScenarios';
import { ScenarioTestDefinition, ScenarioTestResult, OrderState } from '../types';
import { ToolExecutionEngine } from '../core/toolExecutionEngine';
import { DeterministicOrderStore } from '../core/orderReducer';
import { parseDeterministicIntent } from '../core/nluFallback';
import {
  Play,
  RotateCcw,
  CheckCircle2,
  XCircle,
  Clock,
  Terminal,
  Filter,
  Check,
  X,
  ChevronRight,
  Sparkles,
} from 'lucide-react';

interface ScenarioTestRunnerModalProps {
  onClose: () => void;
  onApplyStateToKiosk?: (state: OrderState) => void;
}

/**
 * Conversation pre-state that mirrors what the customer already did before the
 * scenario utterance (e.g. a burger is already in the tray when they say
 * "make that three"). This replaces the old hardcoded tool calls so every
 * scenario runs through the REAL voice pipeline:
 *   utterance -> acoustic normalizer -> parseDeterministicIntent -> tools -> reducer
 */
const PRE_SETUP: Record<number, Array<{ name: string; args: Record<string, any> }>> = {
  5: [{ name: 'add_item', args: { item_id: 'b_aloo_tikki', quantity: 1 } }],
  7: [{ name: 'add_item', args: { item_id: 'b_makhani_paneer', quantity: 1 } }],
  8: [{ name: 'add_item', args: { item_id: 's_peri_fries', quantity: 1 } }],
  9: [{ name: 'add_item', args: { item_id: 'b_veggie_delight', quantity: 1 } }],
  10: [{ name: 'add_item', args: { item_id: 'b_mutton_galouti', quantity: 1 } }],
  24: [{ name: 'add_item', args: { item_id: 'b_aloo_tikki', quantity: 2 } }],
  25: [{ name: 'set_order_type', args: { order_type: 'DINE_IN' } }],
  26: [{ name: 'add_item', args: { item_id: 'b_cheddar_crunch', quantity: 1 } }],
  28: [{ name: 'add_item', args: { item_id: 'b_fish_fillet', quantity: 1 } }],
  30: [{ name: 'add_item', args: { item_id: 's_salted_fries', quantity: 1 } }],
};

export const ScenarioTestRunnerModal: React.FC<ScenarioTestRunnerModalProps> = ({
  onClose,
  onApplyStateToKiosk,
}) => {
  const [results, setResults] = useState<Record<number, ScenarioTestResult>>({});
  const [isRunningAll, setIsRunningAll] = useState(false);
  const [runningId, setRunningId] = useState<number | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>('ALL');

  const categories = [
    'ALL',
    'A: Core & Indian Accents',
    'B: Ambiguity & Corrections',
    'C: Out-of-Stock & Recovery',
    'D: Allergen & Nutrition',
    'E: Prompt Injection & Security',
    'F: Complex & Payments',
    'G: Resilience & Concurrency',
  ];

  const filteredScenarios =
    activeCategory === 'ALL'
      ? DIALOGUE_SCENARIOS
      : DIALOGUE_SCENARIOS.filter(s => s.category === activeCategory);

  const runSingleTest = async (scenario: ScenarioTestDefinition): Promise<ScenarioTestResult> => {
    setRunningId(scenario.id);
    const startTime = performance.now();

    // Isolated test store and execution engine for deterministic verification
    const testStore = new DeterministicOrderStore();
    const engine = new ToolExecutionEngine(testStore);
    const executedTools: string[] = [];
    const toolResults: any[] = [];

    try {
      // 1. Replay the conversation pre-state (what already happened before this utterance)
      for (const step of PRE_SETUP[scenario.id] || []) {
        await engine.execute(step.name, step.args);
      }

      // 2. THE REAL PIPELINE: utterance -> acoustic normalizer -> deterministic NLU
      const parsed = parseDeterministicIntent(scenario.userUtterance, testStore.getState());

      // 3. Execute whatever tool calls the parser actually produced
      for (const tc of parsed.toolCalls) {
        const r = await engine.execute(tc.name, tc.args);
        executedTools.push(tc.name);
        toolResults.push(r);
      }

      // 4. Assert cart state AND that the expected tools were produced
      const assertion = scenario.assertions(testStore.getState(), toolResults);
      const toolMatch =
        scenario.expectedToolCalls.length === 0
          ? executedTools.length === 0
          : scenario.expectedToolCalls.every(t => executedTools.includes(t));
      const passed = assertion.passed && toolMatch;
      const message = toolMatch
        ? assertion.message
        : `${assertion.message} | Expected tools: [${scenario.expectedToolCalls.join(', ') || 'none'}], Actual: [${executedTools.join(', ') || 'none'}]`;

      const durationMs = Math.round(performance.now() - startTime);

      const result: ScenarioTestResult = {
        id: scenario.id,
        title: scenario.title,
        category: scenario.category,
        passed,
        message,
        durationMs,
        executedTools,
        transcript: `${scenario.userUtterance}${parsed.reply ? ` → "${parsed.reply}"` : ''}`,
      };

      setResults(prev => ({ ...prev, [scenario.id]: result }));
      setRunningId(null);
      return result;
    } catch (e: any) {
      const durationMs = Math.round(performance.now() - startTime);
      const result: ScenarioTestResult = {
        id: scenario.id,
        title: scenario.title,
        category: scenario.category,
        passed: false,
        message: `Execution failed: ${e.message}`,
        durationMs,
        executedTools,
        transcript: scenario.userUtterance,
      };
      setResults(prev => ({ ...prev, [scenario.id]: result }));
      setRunningId(null);
      return result;
    }
  };

  const handleRunAll = async () => {
    setIsRunningAll(true);
    for (const s of DIALOGUE_SCENARIOS) {
      await runSingleTest(s);
      await new Promise(r => setTimeout(r, 60)); // small delay for visual feedback
    }
    setIsRunningAll(false);
  };

  const totalPassed = Object.values(results).filter(r => r.passed).length;
  const totalRan = Object.values(results).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 select-none">
      <div className="bg-neutral-900 border border-neutral-800 rounded-3xl max-w-4xl w-full h-[90vh] overflow-hidden shadow-2xl flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-neutral-800 flex items-center justify-between bg-neutral-950">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-purple-600/20 border border-purple-500/40 flex items-center justify-center text-purple-400">
              <Terminal className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-lg font-black text-white">30 Scripted Dialogue Scenarios Suite</h2>
                <span className="text-[10px] font-mono bg-neutral-800 text-neutral-300 px-2 py-0.5 rounded-full">
                  Real Pipeline
                </span>
              </div>
              <p className="text-xs text-neutral-400">
                Runs each utterance through the live NLU parser, tool engine &amp; cart reducer.
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={handleRunAll}
              disabled={isRunningAll}
              className={`px-4 py-2.5 rounded-xl font-bold text-xs transition flex items-center space-x-2 shadow-lg ${
                isRunningAll
                  ? 'bg-neutral-800 text-neutral-500 cursor-not-allowed'
                  : 'bg-purple-600 hover:bg-purple-500 text-white shadow-purple-600/30'
              }`}
            >
              <Play className="w-4 h-4 fill-current" />
              <span>{isRunningAll ? 'Running Tests...' : 'Run All 30 Scenarios'}</span>
            </button>

            <button
              onClick={onClose}
              className="p-2 rounded-full bg-neutral-800 text-neutral-400 hover:text-white transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Progress & Summary Bar */}
        <div className="bg-neutral-950 px-6 py-3 border-b border-neutral-800 flex items-center justify-between">
          <div className="flex items-center space-x-4 text-xs font-semibold">
            <span className="text-neutral-400">
              Executed: <strong className="text-white">{totalRan} / 30</strong>
            </span>
            <span className="text-emerald-400">
              Passed: <strong>{totalPassed}</strong>
            </span>
            {totalRan - totalPassed > 0 && (
              <span className="text-rose-400">
                Failed: <strong>{totalRan - totalPassed}</strong>
              </span>
            )}
          </div>

          {totalRan > 0 && (
            <div className="flex items-center space-x-2">
              <div className="w-40 h-2 bg-neutral-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 transition-all duration-300"
                  style={{ width: `${(totalPassed / 30) * 100}%` }}
                />
              </div>
              <span className="text-xs font-mono font-bold text-neutral-300">
                {Math.round((totalPassed / 30) * 100)}%
              </span>
            </div>
          )}
        </div>

        {/* Category Filters */}
        <div className="p-3 bg-neutral-900 border-b border-neutral-800 flex items-center space-x-2 overflow-x-auto no-scrollbar">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition ${
                activeCategory === cat
                  ? 'bg-neutral-800 text-white border border-neutral-700'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Scenarios List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {filteredScenarios.map(scenario => {
            const res = results[scenario.id];
            const isCurrentlyRunning = runningId === scenario.id;

            return (
              <div
                key={scenario.id}
                className="bg-neutral-950 border border-neutral-800 rounded-2xl p-4 flex items-center justify-between gap-4 hover:border-neutral-700 transition"
              >
                <div className="flex-1 space-y-1">
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-mono font-bold text-neutral-400">
                      #{String(scenario.id).padStart(2, '0')}
                    </span>
                    <span className="text-[10px] font-semibold text-purple-400 bg-purple-950/60 border border-purple-800/80 px-2 py-0.5 rounded">
                      {scenario.category}
                    </span>
                    <h4 className="text-xs font-bold text-white">{scenario.title}</h4>
                  </div>

                  <p className="text-xs text-neutral-300 italic font-medium">
                    &quot;{scenario.userUtterance}&quot;
                  </p>

                  <div className="flex items-center space-x-3 text-[11px] text-neutral-500 pt-1">
                    <span>
                      Expected Tools:{' '}
                      <span className="font-mono text-neutral-400">
                        {scenario.expectedToolCalls.length > 0
                          ? scenario.expectedToolCalls.join(', ')
                          : 'None (Noise/Safe)'}
                      </span>
                    </span>
                    {res && (
                      <span className="text-neutral-400 flex items-center space-x-1">
                        <Clock className="w-3 h-3" />
                        <span>{res.durationMs}ms</span>
                      </span>
                    )}
                  </div>

                  {res && (
                    <div
                      className={`text-xs font-medium pt-1 ${
                        res.passed ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {res.passed ? '✓ Assertion Passed: ' : '✗ Assertion Failed: '}
                      {res.message}
                    </div>
                  )}
                </div>

                {/* Status / Run Button */}
                <div className="flex items-center space-x-3 flex-shrink-0">
                  {res ? (
                    res.passed ? (
                      <div className="flex items-center space-x-1 text-emerald-400 text-xs font-bold bg-emerald-950/60 border border-emerald-800 px-3 py-1.5 rounded-xl">
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Passed</span>
                      </div>
                    ) : (
                      <div className="flex items-center space-x-1 text-rose-400 text-xs font-bold bg-rose-950/60 border border-rose-800 px-3 py-1.5 rounded-xl">
                        <XCircle className="w-4 h-4" />
                        <span>Failed</span>
                      </div>
                    )
                  ) : null}

                  <button
                    onClick={() => runSingleTest(scenario)}
                    disabled={isCurrentlyRunning || isRunningAll}
                    className="p-2 rounded-xl bg-neutral-800 text-neutral-300 hover:text-white hover:bg-neutral-700 transition"
                    title="Run single scenario"
                  >
                    <Play className={`w-4 h-4 ${isCurrentlyRunning ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
