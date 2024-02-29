
//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
//Seeded random number generator giving normal distribution of values
//Seeded is required so that stereo channels can have identical jitter
//Originally direct from  Github Copilot \/(^_^)\/
//but changed SplitMix32 -> values from referenced stackoverflow posts
//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++

// Seeded random number generator
function SeededSplitMix32Random(seed) {
    this.m = 0x80000000-1; // 2**31;
    this.state =Math.floor( (seed ? seed : Math.random()) *this.m);
}

//SplitMix32
//https://stackoverflow.com/questions/521295/seeding-the-random-number-generator-in-javascript
//https://stackoverflow.com/questions/17035441/looking-for-decent-quality-prng-with-only-32-bits-of-state
SeededSplitMix32Random.prototype.nextInt = function() {
    let z = (this.state += 0x9E3779B9) | 0; //Ensure z is a 32bit integer
    z ^= z >> 16; 
    z *= 0x21f0aaad;
    z ^= z >> 15;
    z *= 0x735a2d97;
    z ^= z >> 15;
    return z;
}
SeededSplitMix32Random.prototype.nextFloat = function() {
    // returns in range [0,1]
    return this.nextInt() / this.m ;
}


SeededSplitMix32Random.prototype.nextGaussian = function() {
    return boxMullerRandom(this);
}


// Box-Muller transform
function boxMullerRandom(seededRandom) {
    let u = 0, v = 0;
    while(u === 0) u = seededRandom.nextFloat(); //exclude zero
    while(v === 0) v = seededRandom.nextFloat(); //exclude zero
    return Math.sqrt( -2.0 * Math.log( u ) ) * Math.cos( 2.0 * Math.PI * v );
}

export { SeededSplitMix32Random };