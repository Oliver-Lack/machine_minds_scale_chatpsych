# This is the text-audio API integration. It is NOT implemented yet and still in testing.
# ElevenLabs API reference: https://docs.elevenlabs.io/api-reference/text-to-speech
# ElevenLabs is great, except they are expensive (monthly subscription rather than pay-as-you-go). 
# Other providers are being explored. 

import requests
import json
import os
from typing import Optional, List, Dict, Union, BinaryIO
from dataclasses import dataclass, asdict
from enum import Enum
from dotenv import load_dotenv

# Load env for API keys
load_dotenv()

# Audio format options supported by ElevenLabs
class AudioFormat(Enum):
    MP3_STANDARD_32 = "mp3_44100_32"      # Standard quality 
    MP3_BALANCED_64 = "mp3_44100_64"      # Balanced quality and size
    MP3_PREMIUM_96 = "mp3_44100_96"       # Premium quality for most applications
    MP3_PROFESSIONAL_128 = "mp3_44100_128"  # Professional grade 
    MP3_STUDIO_192 = "mp3_44100_192"      # Studio master quality
    MP3_COMPACT_32 = "mp3_22050_32"       # Compact for streaming
    
    PCM_TELEPHONE_16K = "pcm_16000"       # Telephone PCM
    PCM_BROADCAST_22K = "pcm_22050"       # Broadcast PCM
    PCM_RADIO_24K = "pcm_24000"           # Radio PCM
    PCM_CD_QUALITY_44K = "pcm_44100"      # CD PCM
    
    ULAW_TELEPHONY = "ulaw_8000"          # for telephony systems


class TextProcessingMode(Enum):
    AUTO_DETECT = "auto"        # Automatically decide normalization
    NORMALIZE_ALL = "on"        # Apply full text normalization
    RAW_TEXT = "off"           # Use text as-is without normalization


class ProcessingSpeed(Enum):
    STANDARD_QUALITY = "standard"  # Standard processing
    TURBO_SPEED = "turbo"          # Faster processing


@dataclass
class VoiceSettings:
    stability: float = 0.5  # Voice consistency (0.0 = expressive/variable, 1.0 = stable/consistent)
    similarity_boost: float = 0.5  # Voice clone accuracy (0.0 = loose interpretation, 1.0 = exact match)
    style: Optional[float] = 0.0  # Speaking style intensity (0.0 = natural, 1.0 = exaggerated)
    use_speaker_boost: bool = True  # Enhance speaker characteristics
    
    def to_api_dict(self) -> Dict:
        settings = {}
        if self.stability is not None:
            settings["stability"] = max(0.0, min(1.0, self.stability))
        if self.similarity_boost is not None:
            settings["similarity_boost"] = max(0.0, min(1.0, self.similarity_boost))
        if self.style is not None:
            settings["style"] = max(0.0, min(1.0, self.style))
        if self.use_speaker_boost is not None:
            settings["use_speaker_boost"] = self.use_speaker_boost
        return settings

# this is just for custom word pronunciation stuff offered by elevenlabs
@dataclass
class PronunciationDictionary:
    pronunciation_dictionary_id: str  
    version_id: str  


class SpeechSynthesizer:
    API_BASE_URL = "https://api.elevenlabs.io/v1"
    
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.getenv("ELEVENLABS_API_KEY")
        if not self.api_key:
            raise ValueError("API key required. Set ELEVENLABS_API_KEY in .env file or pass api_key parameter.")
        
        self.session = requests.Session()
        self.session.headers.update({
            "xi-api-key": self.api_key,
            "Content-Type": "application/json"
        })
    
    def synthesize_speech(
        self,
        text_content: str,
        voice_id: str,
        model_id: str = "eleven_multilingual_v2",
        voice_settings: Optional[VoiceSettings] = None,
        language_code: Optional[str] = None,
        pronunciation_dictionaries: Optional[List[PronunciationDictionary]] = None,
        generation_seed: Optional[int] = None,
        previous_text: Optional[str] = None,
        next_text: Optional[str] = None,
        previous_request_ids: Optional[List[str]] = None,
        next_request_ids: Optional[List[str]] = None,
        text_processing: TextProcessingMode = TextProcessingMode.AUTO_DETECT,
        language_normalization: bool = False,
        use_legacy_voice_model: bool = False,
        enable_request_logging: bool = True,
        latency_optimization: Optional[int] = None,
        audio_format: AudioFormat = AudioFormat.MP3_PROFESSIONAL_128
    ) -> bytes:
        """
        Convert text to natural-sounding speech using ElevenLabs API
        
        Args:
            text_content: The text to convert to speech (required)
            voice_id: Voice ID to use for synthesis (required)
            model_id: AI model for generation (default: eleven_multilingual_v2)
            voice_settings: Voice configuration settings
            language_code: ISO 639-1 language code for language-specific processing
            pronunciation_dictionaries: Custom pronunciation dictionaries to apply
            generation_seed: Seed for reproducible results (0-4294967295)
            previous_text: Previous text for better continuity
            next_text: Following text for smoother transitions
            previous_request_ids: Previous request IDs for continuity (max 3)
            next_request_ids: Next request IDs for continuity (max 3)
            text_processing: Text normalization mode
            language_normalization: Enable language-specific text processing
            use_legacy_voice_model: Use legacy voice model (deprecated)
            enable_request_logging: Enable API request logging
            latency_optimization: Latency optimization level (0-4, deprecated)
            audio_format: Output audio format
        
        Returns:
            bytes: Generated audio data
        
        Raises:
            requests.RequestException: If API request fails
            ValueError: If parameters are invalid
        """
        # Validate input parameters
        if not text_content.strip():
            raise ValueError("Text content cannot be empty")
        
        if generation_seed is not None and not (0 <= generation_seed <= 4294967295):
            raise ValueError("Generation seed must be between 0 and 4294967295")
        
        if previous_request_ids and len(previous_request_ids) > 3:
            raise ValueError("Maximum 3 previous request IDs allowed")
        
        if next_request_ids and len(next_request_ids) > 3:
            raise ValueError("Maximum 3 next request IDs allowed")
        
        if latency_optimization is not None and not (0 <= latency_optimization <= 4):
            raise ValueError("Latency optimization must be between 0 and 4")
        
        # Build API request
        api_url = f"{self.API_BASE_URL}/text-to-speech/{voice_id}"
        request_params = {
            "enable_logging": str(enable_request_logging).lower(),
            "output_format": audio_format.value
        }
        
        if latency_optimization is not None:
            request_params["optimize_streaming_latency"] = latency_optimization
        
        payload = {
            "text": text_content,
            "model_id": model_id,
            "apply_text_normalization": text_processing.value,
            "apply_language_text_normalization": language_normalization,
            "use_pvc_as_ivc": use_legacy_voice_model
        }
        
        # optional parameter stuff
        if voice_settings:
            payload["voice_settings"] = voice_settings.to_api_dict()
        
        if language_code:
            payload["language_code"] = language_code
        
        if pronunciation_dictionaries:
            payload["pronunciation_dictionary_locators"] = [
                {
                    "pronunciation_dictionary_id": dictionary.pronunciation_dictionary_id,
                    "version_id": dictionary.version_id
                }
                for dictionary in pronunciation_dictionaries
            ]
        
        if generation_seed is not None:
            payload["seed"] = generation_seed
        
        if previous_text:
            payload["previous_text"] = previous_text
        
        if next_text:
            payload["next_text"] = next_text
        
        if previous_request_ids:
            payload["previous_request_ids"] = previous_request_ids
        
        if next_request_ids:
            payload["next_request_ids"] = next_request_ids
        
        # executing the API request here
        response = self.session.post(
            api_url,
            params=request_params,
            json=payload
        )
        
        if response.status_code != 200:
            error_message = response.text
            try:
                error_data = response.json()
                error_message = error_data.get("detail", error_message)
            except:
                pass
            raise requests.RequestException(
                f"ElevenLabs API error {response.status_code}: {error_message}"
            )
        
        return response.content
    
    def get_available_voices(self) -> List[Dict]:
        """
        Retrieve all available voices from ElevenLabs
        
        Returns:
            List[Dict]: Collection of voice information and metadata
        """
        response = self.session.get(f"{self.API_BASE_URL}/voices")
        response.raise_for_status()
        return response.json().get("voices", [])
    
    def get_voice_details(self, voice_id: str) -> Dict:
        """
        Get detailed information about a specific voice
        
        Args:
            voice_id: The voice identifier to query
        
        Returns:
            Dict: Voice details including settings and capabilities
        """
        response = self.session.get(f"{self.API_BASE_URL}/voices/{voice_id}")
        response.raise_for_status()
        return response.json()
    
    def get_available_models(self) -> List[Dict]:
        """
        Retrieve all available AI models for speech synthesis
        
        Returns:
            List[Dict]: Collection of model information and capabilities
        """
        response = self.session.get(f"{self.API_BASE_URL}/models")
        response.raise_for_status()
        return response.json()
    
    def synthesize_speech_streaming(
        self,
        text_content: str,
        voice_id: str,
        model_id: str = "eleven_multilingual_v2",
        voice_settings: Optional[VoiceSettings] = None,
        language_code: Optional[str] = None,
        pronunciation_dictionaries: Optional[List[PronunciationDictionary]] = None,
        generation_seed: Optional[int] = None,
        previous_text: Optional[str] = None,
        next_text: Optional[str] = None,
        previous_request_ids: Optional[List[str]] = None,
        next_request_ids: Optional[List[str]] = None,
        text_processing: TextProcessingMode = TextProcessingMode.AUTO_DETECT,
        language_normalization: bool = False,
        use_legacy_voice_model: bool = False,
        enable_request_logging: bool = True,
        latency_optimization: Optional[int] = None,
        audio_format: AudioFormat = AudioFormat.MP3_PROFESSIONAL_128
    ):
        """
        Convert text to speech with streaming response for real-time audio
        
        Same parameters as synthesize_speech, but returns streaming audio chunks
        
        Returns:
            Iterator yielding audio chunks as they're generated
        """
        # Input validation (same as main synthesis method)
        if not text_content.strip():
            raise ValueError("Text content cannot be empty")
        
        if generation_seed is not None and not (0 <= generation_seed <= 4294967295):
            raise ValueError("Generation seed must be between 0 and 4294967295")
        
        if previous_request_ids and len(previous_request_ids) > 3:
            raise ValueError("Maximum 3 previous request IDs allowed")
        
        if next_request_ids and len(next_request_ids) > 3:
            raise ValueError("Maximum 3 next request IDs allowed")
        
        if latency_optimization is not None and not (0 <= latency_optimization <= 4):
            raise ValueError("Latency optimization must be between 0 and 4")
        
        # This is for streaming
        streaming_url = f"{self.API_BASE_URL}/text-to-speech/{voice_id}/stream"
        request_params = {
            "enable_logging": str(enable_request_logging).lower(),
            "output_format": audio_format.value
        }
        
        if latency_optimization is not None:
            request_params["optimize_streaming_latency"] = latency_optimization
        
        payload = {
            "text": text_content,
            "model_id": model_id,
            "apply_text_normalization": text_processing.value,
            "apply_language_text_normalization": language_normalization,
            "use_pvc_as_ivc": use_legacy_voice_model
        }
        
        if voice_settings:
            payload["voice_settings"] = voice_settings.to_api_dict()
        
        if language_code:
            payload["language_code"] = language_code
        
        if pronunciation_dictionaries:
            payload["pronunciation_dictionary_locators"] = [
                {
                    "pronunciation_dictionary_id": dictionary.pronunciation_dictionary_id,
                    "version_id": dictionary.version_id
                }
                for dictionary in pronunciation_dictionaries
            ]
        
        if generation_seed is not None:
            payload["seed"] = generation_seed
        
        if previous_text:
            payload["previous_text"] = previous_text
        
        if next_text:
            payload["next_text"] = next_text
        
        if previous_request_ids:
            payload["previous_request_ids"] = previous_request_ids
        
        if next_request_ids:
            payload["next_request_ids"] = next_request_ids
        
        response = self.session.post(
            streaming_url,
            params=request_params,
            json=payload,
            stream=True
        )
        
        if response.status_code != 200:
            error_message = response.text
            try:
                error_data = response.json()
                error_message = error_data.get("detail", error_message)
            except:
                pass
            raise requests.RequestException(
                f"ElevenLabs streaming API error {response.status_code}: {error_message}"
            )
        
        return response.iter_content(chunk_size=1024)
    
    def save_audio_to_file(self, audio_data: bytes, file_path: str) -> str:
        """
        Save generated audio data to a file
        
        Args:
            audio_data: The audio bytes to save
            file_path: Destination file path for the audio
        
        Returns:
            str: The file path where audio was saved
        """
        with open(file_path, 'wb') as audio_file:
            audio_file.write(audio_data)
        return file_path
    
    def save_streaming_audio_to_file(self, audio_stream, file_path: str) -> str:
        """
        Save streaming audio data to a file
        
        Args:
            audio_stream: Iterator yielding audio chunks
            file_path: Destination file path for the audio
        
        Returns:
            str: The file path where audio was saved
        """
        with open(file_path, 'wb') as audio_file:
            for audio_chunk in audio_stream:
                audio_file.write(audio_chunk)
        return file_path


# Extra stuff
def create_voice_settings(
    stability: float = 0.5,
    similarity_boost: float = 0.5,
    style: Optional[float] = None,
    use_speaker_boost: bool = True
) -> VoiceSettings:
    """
    Create voice settings configuration
    
    Args:
        stability: Voice consistency level (0.0=expressive, 1.0=stable)
        similarity_boost: Voice clone accuracy (0.0=loose, 1.0=exact)
        style: Speaking style intensity (0.0=natural, 1.0=exaggerated)
        use_speaker_boost: Enhance speaker characteristics
    
    Returns:
        VoiceSettings: Configured voice settings object
    """
    return VoiceSettings(
        stability=stability,
        similarity_boost=similarity_boost,
        style=style,
        use_speaker_boost=use_speaker_boost
    )


def quick_text_to_speech(
    text: str,
    voice_id: str,
    api_key: Optional[str] = None,
    output_file: Optional[str] = None,
    model_id: str = "eleven_multilingual_v2",
    stability: float = 0.5,
    similarity_boost: float = 0.5,
    audio_format: AudioFormat = AudioFormat.MP3_PROFESSIONAL_128
) -> Union[bytes, str]:
    """
    Quick and easy text-to-speech conversion
    
    Args:
        text: Text to convert to speech
        voice_id: Voice ID to use for synthesis
        api_key: API key (optional if ELEVENLABS_API_KEY is set in .env)
        output_file: File path to save audio (optional)
        model_id: AI model to use for generation
        stability: Voice stability level
        similarity_boost: Voice similarity accuracy
        audio_format: Output audio format
    
    Returns:
        bytes if no output_file specified, str (file path) if saved to file
    """
    synthesizer = SpeechSynthesizer(api_key)
    voice_config = VoiceSettings(
        stability=stability,
        similarity_boost=similarity_boost,
        use_speaker_boost=True
    )
    
    audio_data = synthesizer.synthesize_speech(
        text_content=text,
        voice_id=voice_id,
        model_id=model_id,
        voice_settings=voice_config,
        audio_format=audio_format
    )
    
    if output_file:
        return synthesizer.save_audio_to_file(audio_data, output_file)
    return audio_data


# THIS IS A TEST SECTION. Trying to get the calls to work here and then will plug in chatPsych text responses. 
if __name__ == "__main__":
    
    try:
        synthesizer = SpeechSynthesizer()
        
        print("Available voices:")
        voices = synthesizer.get_available_voices()
        for voice in voices[:3]:  
            print(f"- {voice['name']} (ID: {voice['voice_id']})")
        
        print("\nAvailable models:")
        models = synthesizer.get_available_models()
        for model in models[:3]:  
            print(f"- {model['name']} (ID: {model['model_id']})")
        
        if voices:
            chosen_voice = voices[0]['voice_id']  # Use first available voice
            
            # Create custom voice settings
            custom_settings = VoiceSettings(
                stability=0.3,          # Slightly expressive
                similarity_boost=0.8,   # High accuracy
                style=0.2,              # Subtle style
                use_speaker_boost=True  # Enhanced
            )
            
            sample_text = "Hello! You should build a study with chatPsych!."
            
            print(f"\nGenerating speech for: '{sample_text}'")
            audio_data = synthesizer.synthesize_speech(
                text_content=sample_text,
                voice_id=chosen_voice,
                model_id="eleven_multilingual_v2",
                voice_settings=custom_settings,
                audio_format=AudioFormat.MP3_PROFESSIONAL_128
            )
            
            # Saving audio file here
            # Need to create a temporary storage setup for audio files. Server will get WAY too big otherwise.
            output_filename = "demo_speech.mp3"
            synthesizer.save_audio_to_file(audio_data, output_filename)
            print(f"Audio saved to: {output_filename}")
        
    except ValueError as config_error:
        print(f"Configuration error: {config_error}")
        print("Please set your ElevenLabs API key in the ELEVENLABS_API_KEY environment variable in your .env file")
    except Exception as error:
        print(f"Error occurred: {error}")
