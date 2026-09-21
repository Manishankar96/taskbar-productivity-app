package com.taskbar.app;

import android.os.CancellationSignal;

import androidx.annotation.NonNull;
import androidx.credentials.Credential;
import androidx.credentials.CredentialManager;
import androidx.credentials.CredentialManagerCallback;
import androidx.credentials.CustomCredential;
import androidx.credentials.GetCredentialRequest;
import androidx.credentials.GetCredentialResponse;
import androidx.credentials.exceptions.GetCredentialException;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.libraries.identity.googleid.GetGoogleIdOption;
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential;

import java.util.concurrent.Executor;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "GoogleAuth")
public class GoogleAuthPlugin extends Plugin {

    private CredentialManager credentialManager;

    private final Executor executor =
            Executors.newSingleThreadExecutor();

    @Override
    public void load() {
        super.load();

        credentialManager =
                CredentialManager.create(getContext());
    }

    @PluginMethod
    public void signIn(PluginCall call) {

        try {

            GetGoogleIdOption googleIdOption =
                    new GetGoogleIdOption.Builder()
                            .setFilterByAuthorizedAccounts(false)
                            .setServerClientId(
                                    getContext().getString(
                                            R.string.default_web_client_id
                                    )
                            )
                            .setAutoSelectEnabled(false)
                            .build();

            GetCredentialRequest request =
                    new GetCredentialRequest.Builder()
                            .addCredentialOption(googleIdOption)
                            .build();

            CancellationSignal cancellationSignal =
                    new CancellationSignal();

            credentialManager.getCredentialAsync(
                    getContext(),
                    request,
                    cancellationSignal,
                    executor,
                    new CredentialManagerCallback<
                            GetCredentialResponse,
                            GetCredentialException>() {

                        @Override
                        public void onResult(
                                GetCredentialResponse result) {

                            handleCredentialResult(
                                    result,
                                    call
                            );
                        }

                        @Override
                        public void onError(
                                @NonNull GetCredentialException exception) {

                            call.reject(
                                    "Google Sign-In failed: "
                                            + exception.getMessage()
                            );
                        }
                    }
            );

        } catch (Exception exception) {

            call.reject(
                    "Unable to start Google Sign-In: "
                            + exception.getMessage()
            );
        }
    }

    private void handleCredentialResult(
            GetCredentialResponse result,
            PluginCall call) {

        try {

            Credential credential =
                    result.getCredential();

            if (!(credential instanceof CustomCredential)) {

                call.reject(
                        "Unsupported Google credential"
                );

                return;
            }

            CustomCredential customCredential =
                    (CustomCredential) credential;

            if (!GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL
                    .equals(customCredential.getType())) {

                call.reject(
                        "Received an unsupported credential type"
                );

                return;
            }

            GoogleIdTokenCredential googleIdTokenCredential =
                    GoogleIdTokenCredential.createFrom(
                            customCredential.getData()
                    );

            String idToken =
                    googleIdTokenCredential.getIdToken();

            if (idToken == null || idToken.isEmpty()) {

                call.reject(
                        "Google ID token is empty"
                );

                return;
            }

            JSObject response =
                    new JSObject();

            response.put(
                    "success",
                    true
            );

            response.put(
                    "idToken",
                    idToken
            );

            response.put(
                    "displayName",
                    googleIdTokenCredential.getDisplayName()
            );

            response.put(
                    "profilePictureUri",
                    googleIdTokenCredential.getProfilePictureUri() != null
                            ? googleIdTokenCredential
                            .getProfilePictureUri()
                            .toString()
                            : null
            );

            call.resolve(response);

        } catch (Exception exception) {

            call.reject(
                    "Google credential processing failed: "
                            + exception.getMessage()
            );
        }
    }
}