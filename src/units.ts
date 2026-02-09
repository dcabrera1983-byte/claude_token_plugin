import * as vscode from 'vscode';
import { TokenUsage } from './logParser.js';

export type DisplayUnit = 'tokens' | 'cost_usd' | 'energy_kwh' | 'trees_burned';

// Per-million-token pricing by model family
interface ModelPricing {
    input: number;
    output: number;
    cache_creation: number;
    cache_read: number;
}

// Default pricing (used as fallback when settings are not configured)
const DEFAULT_MODEL_PRICING: Record<string, ModelPricing> = {
    opus: {
        input: 5.00,
        output: 25.00,
        cache_creation: 10.00,
        cache_read: 0.50,
    },
    sonnet: {
        input: 3.00,
        output: 15.00,
        cache_creation: 6.00,
        cache_read: 0.30,
    },
    haiku: {
        input: 1.00,
        output: 5.00,
        cache_creation: 2.00,
        cache_read: 0.10,
    },
};

/**
 * Read per-model pricing from VSCode settings, falling back to defaults.
 */
function getModelPricing(family: string): ModelPricing {
    const config = vscode.workspace.getConfiguration('claudeTokenTracker');
    const defaults = DEFAULT_MODEL_PRICING[family] || DEFAULT_MODEL_PRICING.opus;

    return {
        input: config.get<number>(`pricing.${family}.input`, defaults.input),
        output: config.get<number>(`pricing.${family}.output`, defaults.output),
        cache_creation: config.get<number>(`pricing.${family}.cacheCreation`, defaults.cache_creation),
        cache_read: config.get<number>(`pricing.${family}.cacheRead`, defaults.cache_read),
    };
}

// Rough estimate: ~0.001 kWh per 1000 tokens (illustrative)
const KWH_PER_TOKEN = 0.000001;

// Rough estimate: ~0.00001 trees per 1000 tokens (illustrative/fun)
const TREES_PER_TOKEN = 0.00000001;

/**
 * Get the currently configured display unit from VSCode settings.
 */
export function getDisplayUnit(): DisplayUnit {
    const config = vscode.workspace.getConfiguration('claudeTokenTracker');
    return (config.get<string>('displayUnit') || 'tokens') as DisplayUnit;
}

/**
 * Resolve a model ID string to its pricing family key.
 * e.g. "claude-opus-4-6" -> "opus", "claude-sonnet-4-5-20250929" -> "sonnet"
 */
export function getModelFamily(modelId: string): string {
    const lower = modelId.toLowerCase();
    if (lower.includes('opus')) { return 'opus'; }
    if (lower.includes('sonnet')) { return 'sonnet'; }
    if (lower.includes('haiku')) { return 'haiku'; }
    return 'opus';
}

/**
 * Get a short display name for a model ID.
 * e.g. "claude-opus-4-6" -> "Opus 4.6"
 */
export function getModelDisplayName(modelId: string): string {
    const known: Record<string, string> = {
        'claude-opus-4-6': 'Opus 4.6',
        'claude-opus-4-5-20251101': 'Opus 4.5',
        'claude-sonnet-4-5-20250929': 'Sonnet 4.5',
    };
    if (known[modelId]) {
        return known[modelId];
    }
    return modelId.replace(/^claude-/, '').replace(/-/g, ' ');
}

/**
 * Calculate USD cost from token usage using per-model pricing.
 */
export function calculateModelCost(usage: TokenUsage, model: string): number {
    const family = getModelFamily(model);
    const pricing = getModelPricing(family);
    return (
        (usage.input_tokens * pricing.input) / 1_000_000 +
        (usage.output_tokens * pricing.output) / 1_000_000 +
        (usage.cache_creation_input_tokens * pricing.cache_creation) / 1_000_000 +
        (usage.cache_read_input_tokens * pricing.cache_read) / 1_000_000
    );
}

/**
 * Calculate USD cost from token usage (uses default Opus pricing).
 */
export function calculateCost(usage: TokenUsage): number {
    const pricing = getModelPricing('opus');
    return (
        (usage.input_tokens * pricing.input) / 1_000_000 +
        (usage.output_tokens * pricing.output) / 1_000_000 +
        (usage.cache_creation_input_tokens * pricing.cache_creation) / 1_000_000 +
        (usage.cache_read_input_tokens * pricing.cache_read) / 1_000_000
    );
}

/**
 * Calculate estimated energy in kWh from total token count.
 */
export function calculateEnergy(usage: TokenUsage): number {
    const totalTokens = usage.input_tokens + usage.output_tokens +
        usage.cache_creation_input_tokens + usage.cache_read_input_tokens;
    return totalTokens * KWH_PER_TOKEN;
}

/**
 * Calculate "trees burned" from total token count (fun metric).
 */
export function calculateTreesBurned(usage: TokenUsage): number {
    const totalTokens = usage.input_tokens + usage.output_tokens +
        usage.cache_creation_input_tokens + usage.cache_read_input_tokens;
    return totalTokens * TREES_PER_TOKEN;
}

/**
 * Format a usage value in the selected display unit.
 */
export function formatUsage(usage: TokenUsage, unit: DisplayUnit): string {
    switch (unit) {
        case 'tokens': {
            const total = usage.input_tokens + usage.output_tokens;
            if (total >= 1_000_000) {
                return (total / 1_000_000).toFixed(1) + 'M tokens';
            }
            if (total >= 1_000) {
                return (total / 1_000).toFixed(1) + 'k tokens';
            }
            return total + ' tokens';
        }
        case 'cost_usd': {
            const cost = calculateCost(usage);
            return '$' + cost.toFixed(4);
        }
        case 'energy_kwh': {
            const kwh = calculateEnergy(usage);
            return kwh.toFixed(4) + ' kWh';
        }
        case 'trees_burned': {
            const trees = calculateTreesBurned(usage);
            return trees.toFixed(6) + ' trees';
        }
    }
}

/**
 * Get the label for a display unit (for UI display).
 */
export function getUnitLabel(unit: DisplayUnit): string {
    switch (unit) {
        case 'tokens': return 'Token Count';
        case 'cost_usd': return 'USD Cost';
        case 'energy_kwh': return 'Energy (kWh)';
        case 'trees_burned': return 'Trees Burned';
    }
}
