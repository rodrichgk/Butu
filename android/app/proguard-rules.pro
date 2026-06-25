# Keep model classes used with kotlinx-serialization (Plex/Jellyfin DTOs)
-keepattributes *Annotation*, InnerClasses
-keep,includedescriptorclasses class dev.butu.**$$serializer { *; }
-keepclassmembers class dev.butu.** {
    *** Companion;
}
-keepclasseswithmembers class dev.butu.** {
    kotlinx.serialization.KSerializer serializer(...);
}

# Coroutines
-keepnames class kotlinx.coroutines.internal.MainDispatcherFactory {}
-keepnames class kotlinx.coroutines.CoroutineExceptionHandler {}
-keepnames class kotlinx.coroutines.android.AndroidExceptionPreHandler {}
-keepnames class kotlinx.coroutines.android.AndroidDispatcherFactory {}

# Retrofit / OkHttp
-dontwarn okhttp3.internal.platform.**
-dontwarn org.conscrypt.**
-dontwarn org.bouncycastle.**
-dontwarn org.openjsse.**

# Media3
-keep class androidx.media3.** { *; }
-dontwarn androidx.media3.**
