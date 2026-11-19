package com.byteburger.kiosk;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.media.AudioManager;
import android.os.Bundle;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.speech.tts.Voice;
import android.util.Log;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;
import java.util.Locale;
import java.util.Set;

public class MainActivity extends BridgeActivity implements TextToSpeech.OnInitListener {

    private static final String TAG = "ByteBurgerMainActivity";
    private static final int RECORD_AUDIO_PERMISSION_REQUEST = 1001;

    private TextToSpeech nativeTts;
    private boolean ttsInitialized = false;
    private Voice indianFemaleVoice = null;
    private Voice hindiFemaleVoice = null;

    @Override
    public void onInit(int status) {
        if (status == TextToSpeech.SUCCESS) {
            ttsInitialized = true;
            setupIndianVoices();
            Log.i(TAG, "Native Android TextToSpeech initialized successfully with Indian female voice support");
        } else {
            Log.w(TAG, "Native TextToSpeech onInit failed with status: " + status);
        }
    }

    private void setupIndianVoices() {
        if (nativeTts == null) return;
        try {
            nativeTts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                @Override
                public void onStart(String utteranceId) {
                    runOnUiThread(() -> {
                        if (bridge != null && bridge.getWebView() != null) {
                            bridge.getWebView().evaluateJavascript(
                                "window.dispatchEvent(new CustomEvent('native_speech_started'));", null
                            );
                        }
                    });
                }

                @Override
                public void onDone(String utteranceId) {
                    runOnUiThread(() -> {
                        if (bridge != null && bridge.getWebView() != null) {
                            bridge.getWebView().evaluateJavascript(
                                "window.dispatchEvent(new CustomEvent('native_speech_ended'));", null
                            );
                        }
                    });
                }

                @Override
                public void onError(String utteranceId) {
                    runOnUiThread(() -> {
                        if (bridge != null && bridge.getWebView() != null) {
                            bridge.getWebView().evaluateJavascript(
                                "window.dispatchEvent(new CustomEvent('native_speech_ended'));", null
                            );
                        }
                    });
                }
            });

            Set<Voice> voices = nativeTts.getVoices();
            if (voices != null) {
                for (Voice v : voices) {
                    String name = v.getName().toLowerCase();
                    Locale loc = v.getLocale();
                    String lang = (loc != null ? loc.getLanguage() : "").toLowerCase();
                    String country = (loc != null ? loc.getCountry() : "").toLowerCase();

                    boolean isMale = name.contains("male") || name.contains("man") || name.contains("boy") ||
                                     name.contains("david") || name.contains("ravi") || name.contains("prabhat");

                    // Indian English female voice candidate
                    if (!isMale && (country.equals("in") || name.contains("en-in") || name.contains("en_in"))) {
                        if (indianFemaleVoice == null || name.contains("female") || name.contains("-f-") || name.contains("network")) {
                            indianFemaleVoice = v;
                        }
                    }

                    // Hindi female voice candidate
                    if (!isMale && (lang.equals("hi") || name.contains("hi-in") || name.contains("hindi"))) {
                        if (hindiFemaleVoice == null || name.contains("female") || name.contains("-f-") || name.contains("network")) {
                            hindiFemaleVoice = v;
                        }
                    }
                }
            }

            Log.i(TAG, "Selected Indian English Voice: " + (indianFemaleVoice != null ? indianFemaleVoice.getName() : "System Default (en-IN)"));
            Log.i(TAG, "Selected Hindi Voice: " + (hindiFemaleVoice != null ? hindiFemaleVoice.getName() : "System Default (hi-IN)"));
        } catch (Exception e) {
            Log.w(TAG, "setupIndianVoices error: " + e.getMessage());
        }
    }

    private class AndroidAudioBridge {
        @JavascriptInterface
        public void forceSpeaker() {
            runOnUiThread(() -> forceLoudspeakerMode());
        }

        @JavascriptInterface
        public boolean isNativeTtsReady() {
            return ttsInitialized;
        }

        @JavascriptInterface
        public void stopSpeaking() {
            runOnUiThread(() -> {
                if (nativeTts != null) {
                    try {
                        nativeTts.stop();
                    } catch (Exception ignored) {}
                }
            });
        }

        @JavascriptInterface
        public boolean speakIndian(String text, String languageCode, float pitch, float rate) {
            if (!ttsInitialized || nativeTts == null || text == null || text.trim().isEmpty()) {
                return false;
            }

            // Verify if the Android OS has ANY valid TTS voice packages installed
            try {
                Set<Voice> voices = nativeTts.getVoices();
                if (voices == null || voices.isEmpty()) {
                    Log.w(TAG, "No TTS voice data packages installed in Android OS. Falling back to cloud audio.");
                    return false;
                }
            } catch (Exception e) {
                Log.w(TAG, "Voice check error: " + e.getMessage());
                return false;
            }

            runOnUiThread(() -> {
                try {
                    forceLoudspeakerMode();
                    nativeTts.stop();

                    boolean isHindi = "hi-IN".equalsIgnoreCase(languageCode) ||
                            text.matches(".*[\\u0900-\\u097F].*") ||
                            text.toLowerCase().matches(".*\\b(namaste|swagat|shukriya|dhanyawad|aapka|bhai|chahiye|aur|hai|hain|kardo|kripya|batao|daal|paneer|tikki)\\b.*");

                    if (isHindi) {
                        nativeTts.setLanguage(new Locale("hi", "IN"));
                        if (hindiFemaleVoice != null) {
                            try { nativeTts.setVoice(hindiFemaleVoice); } catch (Exception ignored) {}
                        }
                    } else {
                        nativeTts.setLanguage(new Locale("en", "IN"));
                        if (indianFemaleVoice != null) {
                            try { nativeTts.setVoice(indianFemaleVoice); } catch (Exception ignored) {}
                        }
                    }

                    nativeTts.setPitch(pitch > 0 ? pitch : 1.15f);
                    nativeTts.setSpeechRate(rate > 0 ? rate : 0.95f);

                    Bundle params = new Bundle();
                    params.putInt(TextToSpeech.Engine.KEY_PARAM_STREAM, AudioManager.STREAM_MUSIC);
                    params.putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME, 1.0f);
                    String utteranceId = "byteburger_utt_" + System.currentTimeMillis();

                    nativeTts.speak(text, TextToSpeech.QUEUE_FLUSH, params, utteranceId);
                } catch (Exception e) {
                    Log.w(TAG, "speakIndian execution error: " + e.getMessage());
                }
            });
            return true;
        }
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Keep 10-inch kiosk screen always awake
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        // Always route hardware volume keys and playback to media loudspeaker
        setVolumeControlStream(AudioManager.STREAM_MUSIC);
        forceLoudspeakerMode();

        // Enable immersive full-screen kiosk mode
        enableKioskImmersiveMode();

        // Check and request microphone permission on app launch
        checkAndRequestAudioPermission();

        // Initialize Android native TextToSpeech engine with Indian female voices
        try {
            nativeTts = new TextToSpeech(this, this);
        } catch (Exception e) {
            Log.w(TAG, "Failed to instantiate native TextToSpeech: " + e.getMessage());
        }

        // Auto-grant Web audio capture permissions in WebView
        if (bridge != null && bridge.getWebView() != null) {
            WebSettings settings = bridge.getWebView().getSettings();
            settings.setMediaPlaybackRequiresUserGesture(false);
            settings.setDomStorageEnabled(true);
            settings.setDatabaseEnabled(true);

            // Expose native loudspeaker routing bridge & Indian TTS to JS
            bridge.getWebView().addJavascriptInterface(new AndroidAudioBridge(), "AndroidAudioBridge");

            bridge.getWebView().setWebChromeClient(new WebChromeClient() {
                @Override
                public void onPermissionRequest(final PermissionRequest request) {
                    runOnUiThread(() -> {
                        String[] resources = request.getResources();
                        for (String r : resources) {
                            if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(r)) {
                                request.grant(resources);
                                // Re-assert loudspeaker routing after mic permission grant
                                forceLoudspeakerMode();
                                return;
                            }
                        }
                        request.grant(resources);
                    });
                }
            });
        }
    }

    @Override
    public void onResume() {
        super.onResume();
        forceLoudspeakerMode();
    }

    @Override
    public void onDestroy() {
        if (nativeTts != null) {
            try {
                nativeTts.stop();
                nativeTts.shutdown();
            } catch (Exception ignored) {}
            nativeTts = null;
        }
        super.onDestroy();
    }

    private void forceLoudspeakerMode() {
        try {
            AudioManager am = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
            if (am != null) {
                if (am.getMode() != AudioManager.MODE_NORMAL) {
                    am.setMode(AudioManager.MODE_NORMAL);
                }
                am.setMicrophoneMute(false);
            }
        } catch (Exception ignored) {
        }
    }

    private void enableKioskImmersiveMode() {
        int flags = View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY;
        getWindow().getDecorView().setSystemUiVisibility(flags);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            enableKioskImmersiveMode();
            forceLoudspeakerMode();
        }
    }

    private void checkAndRequestAudioPermission() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
                != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(
                    this,
                    new String[]{Manifest.permission.RECORD_AUDIO, Manifest.permission.MODIFY_AUDIO_SETTINGS},
                    RECORD_AUDIO_PERMISSION_REQUEST
            );
        }
    }
}
