/** Exported memory */
export declare const memory: WebAssembly.Memory;
/**
 * assembly/index/analyzeFrames
 * @param samples `~lib/typedarray/Float32Array`
 * @param sampleRate `i32`
 * @param frameSize `i32`
 * @param hopSize `i32`
 * @returns `~lib/typedarray/Float32Array`
 */
export declare function analyzeFrames(samples: Float32Array, sampleRate: number, frameSize: number, hopSize: number): Float32Array;
/**
 * assembly/index/classifyChords
 * @param framesData `~lib/typedarray/Float32Array`
 * @param numFrames `i32`
 * @returns `~lib/typedarray/Int32Array`
 */
export declare function classifyChords(framesData: Float32Array, numFrames: number): Int32Array;
/**
 * assembly/index/estimateTempo
 * @param framesData `~lib/typedarray/Float32Array`
 * @param numFrames `i32`
 * @param hopSize `i32`
 * @param sampleRate `i32`
 * @param minBpm `f32`
 * @param maxBpm `f32`
 * @returns `f32`
 */
export declare function estimateTempo(framesData: Float32Array, numFrames: number, hopSize: number, sampleRate: number, minBpm: number, maxBpm: number): number;
