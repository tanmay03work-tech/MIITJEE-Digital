package com.miitjee.digital

import android.app.Application
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost
import com.facebook.react.defaults.DefaultReactNativeHost

class MainApplication : Application(), ReactApplication {
    override val reactNativeHost: ReactNativeHost by lazy {
        object : DefaultReactNativeHost(this) {
            override fun getPackages() = PackageList(this).packages

            override fun getJSMainModuleName(): String = "index"

            override fun getUseDeveloperSupport(): Boolean = BuildConfig.DEBUG
        }
    }

    override val reactHost: ReactHost by lazy {
        DefaultReactHost.getDefaultReactHost(applicationContext, reactNativeHost)
    }

    override fun onCreate() {
        super.onCreate()
        loadReactNative(this)
    }
}
