//https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Using_AudioWorklet
//https://developer.chrome.com/blog/audio-worklet
class MyAudioProcessor extends AudioWorkletProcessor {
    constructor() {
      super();

      this.numberOfInputs = 0;
      this.numberOfInputChannels = 0;
      this.inputBufferSize = 0;

      this.inBufferCount = 0;
      this.playList = [];

      this.port.onmessage = (event)=>{
        const payload = event.data;
        switch (payload.type) {
            case "playSound":
                startPlayingSound(payload.data.index)
            break;
            case "loadSounds":
                loadSounds(payload.data.sounds);
            break;
            case "report":
                console.log("Number of inputs: "+ this.numberOfInputs);
                console.log("Number of input1 channels: "+ this.numberOfInputChannels);
                console.log("Input BufferSize: "+ this.inputBufferSize);
                console.log("BufferSize: "+ this.outputBufferSize);
                console.log("In buffers: "+ this.inBufferCount);
            break;

        }
      }
    }
    
    static get parameterDescriptors() {
        return [{
          name: 'sampleRate',
          defaultValue: 48000,
        },
        {
            name: 'decay',
            defaultValue: 0.1,
            minValue:0,
            maxValue:1,
        }
        ];}


    
    process(inputList, outputList, parameters) {
        const sampleRate = parameters.sampleRate??48000

        
        this.numberOfOutputs = outputList.length;
        this.numberOfOutputChannels = 0;
        this.outputBufferSize = 0;
        if (this.numberOfOutputs >0) {
            const firstOutput = outputList[0];
            this.numberOfOutputChannels = firstOutput.length;
            if (this.numberOfOutputChannels > 0) {
                this.outBufferCount++;
                const firstOutChannel = firstOutput[1];
                this.outputBufferSize = firstOutChannel.length;
                this.processOutput(firstOutChannel, sampleRate);
            }
        }

      return true;
    }

    
    processOutput(buffers, sampleRate, decay){
        if (!this.Sounds) return;

        const decayStep = 1/(sampleRate*decay);

        this.playList.forEach((item)=>{
            const sound = this.sounds[item.index];
            if (!sound || sound.length < 1) return;
            const b1 = sound[0];
            const b2 = sound[sound.length>1 ? 1:0];
            const bs = [b1, b2];
            for (let i=0; i<b1.length; i++){
                if (item.isFading){
                    item.level -= decayStep;
                    if (item.level <= 0){
                        item.level = 0;
                        item.isFading = false;
                        item.isDone=true;
                    }
                }
                let channel=0;
                buffers.forEach((buffer)=>{
                    buffer[i] += bs[channel][item.position]*item.level;
                    channel++;
                });                
            }
        });

        this.playList = this.playList.filter((item)=>{
            return !item.isDone;
        });

    }

    startPlayingSound(index){
        this.playList.forEach((item)=>{
            item.isFading = true; 
        });
        this.playList.push({
            index: index,
            position: 0,
            level: 1
        });
        
    }

    loadSounds(sounds){
        let index=0;
        this.sounds = new Array(sounds.length);
        sounds.forEach(sound => {
            this.sounds[index++] = sound;
        });
    }   



  }
  
  registerProcessor("mushraPlayer", MyAudioProcessor);