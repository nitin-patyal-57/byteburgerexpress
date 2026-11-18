package com.byteburger.kiosk;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.media.AudioManager;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    private static final int RECORD_AUDIO_PERMISSION_REQUEST = 1001;

    private class AndroidAudioBridge {
        @JavascriptInterface
        public void forceSpeaker() {
            runOnUiThread(() -> forceLoudspeakerMode());
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

        // Auto-grant Web audio capture permissions in WebView
        if (bridge != null && bridge.getWebView() != null) {
            WebSettings settings = bridge.getWebView().getSettings();
            settings.setMediaPlaybackRequiresUserGesture(false);
            settings.setDomStorageEnabled(true);
            settings.setDatabaseEnabled(true);

            // Expose native loudspeaker routing bridge to JS
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

    private void forceLoudspeakerMode() {
        try {
            AudioManager am = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
            if (am != null) {
                // Critical fix for Rockchip RK3568 / AOSP POS tablets:
                // Prevent WebView getUserMedia from trapping audio in MODE_IN_COMMUNICATION (silent earpiece)
                am.setMode(AudioManager.MODE_NORMAL);
                am.setSpeakerphoneOn(true);
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
