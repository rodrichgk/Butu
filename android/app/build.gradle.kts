import java.util.Properties

// ─── Read .env from the repo root ─────────────────────────────────────────────
val dotEnv: Map<String, String> = buildMap {
    val f = rootProject.rootDir.parentFile.resolve(".env")
    if (f.exists()) {
        f.readLines()
            .filter { !it.trimStart().startsWith("#") && "=" in it }
            .forEach { line ->
                val idx = line.indexOf('=')
                put(line.substring(0, idx).trim(), line.substring(idx + 1).trim())
            }
    }
}

// ─── Release signing ──────────────────────────────────────────────────────────
// Secrets live in keystore.properties at the repo root (gitignored), NOT in source.
// If it's absent (e.g. CI without secrets), the release build is just left unsigned.
val keystoreProps = Properties().apply {
    val f = rootProject.rootDir.parentFile.resolve("keystore.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.ksp)
    alias(libs.plugins.hilt)
}

android {
    namespace = "dev.butu"
    compileSdk = 35

    defaultConfig {
        applicationId = "dev.butu"
        minSdk = 26
        targetSdk = 34
        versionCode = 3
        versionName = "0.1.2"

        vectorDrawables { useSupportLibrary = true }

        buildConfigField("String", "PLEX_SERVER_URL", "\"${dotEnv["VITE_PLEX_SERVER_URL"].orEmpty()}\"")
        buildConfigField("String", "PLEX_TOKEN",      "\"${dotEnv["VITE_PLEX_TOKEN"].orEmpty()}\"")
        buildConfigField("String", "SUPABASE_URL",      "\"${dotEnv["SUPABASE_URL"].orEmpty()}\"")
        buildConfigField("String", "SUPABASE_ANON_KEY", "\"${dotEnv["SUPABASE_ANON_KEY"].orEmpty()}\"")
    }

    signingConfigs {
        val ksFile = rootProject.rootDir.parentFile.resolve("butu-release.keystore")
        val ksPass = keystoreProps.getProperty("storePassword")
        if (ksFile.exists() && ksPass != null) {
            create("release") {
                storeFile = ksFile
                storePassword = ksPass
                keyAlias = keystoreProps.getProperty("keyAlias")
                keyPassword = keystoreProps.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
            // Signed when keystore.properties is present, otherwise unsigned.
            signingConfig = signingConfigs.findByName("release")
            // Never ship the dev's personal Plex credentials in a public build — users sign in
            // themselves (PIN/QR). These override the dev values baked into defaultConfig so the
            // token is absent from the release APK and the auto-login below is a no-op.
            buildConfigField("String", "PLEX_TOKEN", "\"\"")
            buildConfigField("String", "PLEX_SERVER_URL", "\"\"")
        }
        debug {
            applicationIdSuffix = ".debug"
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
        freeCompilerArgs += listOf(
            "-opt-in=kotlin.RequiresOptIn",
            "-opt-in=kotlinx.coroutines.ExperimentalCoroutinesApi",
            "-opt-in=androidx.compose.material3.ExperimentalMaterial3Api",
            "-opt-in=androidx.tv.material3.ExperimentalTvMaterial3Api",
            "-opt-in=androidx.tv.foundation.ExperimentalTvFoundationApi",
            "-opt-in=coil3.annotation.ExperimentalCoilApi"
        )
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.activity.compose)

    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.graphics)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.material.icons.extended)
    implementation(libs.androidx.compose.foundation)
    implementation(libs.androidx.compose.animation)
    implementation(libs.androidx.compose.runtime)
    implementation(libs.androidx.compose.ui.text.google.fonts)
    debugImplementation(libs.androidx.compose.ui.tooling)

    implementation(libs.androidx.tv.foundation)
    implementation(libs.androidx.tv.material)

    implementation(libs.androidx.navigation.compose)

    implementation(libs.hilt.android)
    ksp(libs.hilt.compiler)
    implementation(libs.hilt.navigation.compose)

    implementation(libs.retrofit)
    implementation(libs.retrofit.kotlinx.serialization)
    implementation(libs.okhttp)
    implementation(libs.okhttp.logging)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.kotlinx.serialization.xml)

    implementation(libs.coil.compose)
    implementation(libs.coil.network.okhttp)

    implementation(libs.media3.exoplayer)
    implementation(libs.media3.exoplayer.hls)
    implementation(libs.media3.exoplayer.dash)
    implementation(libs.media3.ui)
    implementation(libs.media3.session)

    implementation(libs.androidx.datastore.preferences)
    implementation(libs.androidx.palette)

    implementation(libs.ktor.server.core)
    implementation(libs.ktor.server.cio)
    implementation(libs.ktor.server.websockets)

    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.zxing.core)
}
