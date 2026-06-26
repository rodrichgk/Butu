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

# Ktor (transitive) references JVM-only java.lang.management classes on its debug-detector
# path; they don't exist on Android. Safe to ignore (from R8 missing_rules.txt).
-dontwarn java.lang.management.ManagementFactory
-dontwarn java.lang.management.RuntimeMXBean
