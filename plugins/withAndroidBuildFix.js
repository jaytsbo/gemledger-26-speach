const { withProjectBuildGradle, withAppBuildGradle } = require('expo/config-plugins');

const KEYSTORE_PROPS_EXPR =
  'new File(System.getProperty("user.home"), ".android/gemledger-keystore.properties")';

const RELEASE_SIGNING_BLOCK = `        release {
            def keystorePropsFile = ${KEYSTORE_PROPS_EXPR}
            if (keystorePropsFile.exists()) {
                def props = new Properties()
                keystorePropsFile.withInputStream { props.load(it) }
                storeFile file(props['storeFile'])
                storePassword props['storePassword']
                keyAlias props['keyAlias']
                keyPassword props['keyPassword']
            }
        }`;

/**
 * Ensures root build.gradle pins kotlin-gradle-plugin to $kotlinVersion.
 */
function fixKotlinClasspath(contents) {
  return contents.replace(
    /classpath\(['"]org\.jetbrains\.kotlin:kotlin-gradle-plugin['"]\)/g,
    'classpath("org.jetbrains.kotlin:kotlin-gradle-plugin:$kotlinVersion")'
  );
}

/**
 * Ensures app/build.gradle configures optional release keystore signing.
 */
function fixReleaseSigning(contents) {
  let updated = contents;

  if (!updated.includes('gemledger-keystore.properties')) {
    updated = updated.replace(
      /(signingConfigs\s*\{[\s\S]*?debug\s*\{[\s\S]*?\}\s*)(\n\s*\})/,
      `$1\n${RELEASE_SIGNING_BLOCK}$2`
    );
  }

  if (!/buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?gemledger-keystore\.properties/.test(updated)) {
    updated = updated.replace(
      /(buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?)signingConfig\s+signingConfigs\.debug/,
      `$1def keystorePropsFile = ${KEYSTORE_PROPS_EXPR}\n            signingConfig keystorePropsFile.exists() ? signingConfigs.release : signingConfigs.debug`
    );
  }

  return updated;
}

module.exports = function withAndroidBuildFix(config) {
  config = withProjectBuildGradle(config, (mod) => {
    if (mod.modResults.language === 'groovy') {
      mod.modResults.contents = fixKotlinClasspath(mod.modResults.contents);
    }
    return mod;
  });

  config = withAppBuildGradle(config, (mod) => {
    if (mod.modResults.language === 'groovy') {
      mod.modResults.contents = fixReleaseSigning(mod.modResults.contents);
    }
    return mod;
  });

  return config;
};
