package com.taskbar.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {

        // Register custom Google Auth plugin BEFORE Capacitor starts
        registerPlugin(GoogleAuthPlugin.class);

        super.onCreate(savedInstanceState);
    }
}