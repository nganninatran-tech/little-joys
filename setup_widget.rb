# Little Joys prototype: add a WidgetKit target to the generated Capacitor Xcode project.
# Simulator compile test only. App Group + journal bridge not yet implemented.
# Put extension sources and Info.plist under ios/App/App/, matching project file references.
require 'xcodeproj'
require 'fileutils'
require 'plist'

project_path = 'ios/App/App.xcodeproj'
raise "Missing #{project_path}; first run npx cap add ios" unless File.exist?(project_path)
source_path = 'WidgetExtension/LittleJoysWidget.swift'
raise "Missing #{source_path}" unless File.file?(source_path)

project = Xcodeproj::Project.open(project_path)
app = project.targets.find { |t| t.name == 'App' }
raise 'Capacitor App target not found' unless app
if project.targets.any? { |t| t.name == 'LittleJoysWidgetExtension' }
  puts 'Widget target already exists'
  exit 0
end

extension_dir = 'ios/App/App/LittleJoysWidgetExtension'
FileUtils.mkdir_p(extension_dir)
FileUtils.cp(source_path, File.join(extension_dir, 'LittleJoysWidget.swift'))
info_path = File.join(extension_dir, 'Info.plist')
File.write(info_path, {
  'CFBundleDevelopmentRegion' => 'en',
  'CFBundleDisplayName' => 'Little Joys Widget',
  'CFBundleExecutable' => '$(EXECUTABLE_NAME)',
  'CFBundleIdentifier' => '$(PRODUCT_BUNDLE_IDENTIFIER)',
  'CFBundleInfoDictionaryVersion' => '6.0',
  'CFBundleName' => '$(PRODUCT_NAME)',
  'CFBundlePackageType' => 'XPC!',
  'CFBundleShortVersionString' => '1.0',
  'CFBundleVersion' => '1',
  'NSExtension' => { 'NSExtensionPointIdentifier' => 'com.apple.widgetkit-extension' }
}.to_plist)

root = project.main_group.find_subpath('LittleJoysWidgetExtension', true)
root.set_source_tree('SOURCE_ROOT')
root.set_path('App/LittleJoysWidgetExtension')
swift_ref = root.new_file('LittleJoysWidget.swift')
root.new_file('Info.plist')

widget = project.new_target(:app_extension, 'LittleJoysWidgetExtension', :ios, '17.0')
# xcodeproj may leave the output name blank; explicitly name the .appex product.
widget.product_reference.path = 'LittleJoysWidgetExtension.appex'
widget.product_reference.name = 'LittleJoysWidgetExtension.appex'
widget.source_build_phase.add_file_reference(swift_ref)
widget.build_configurations.each do |config|
  settings = config.build_settings
  settings['PRODUCT_NAME'] = 'LittleJoysWidgetExtension'
  settings['EXECUTABLE_NAME'] = 'LittleJoysWidgetExtension'
  settings['WRAPPER_EXTENSION'] = 'appex'
  settings['PRODUCT_BUNDLE_IDENTIFIER'] = 'com.littlejoys.preview.widget'
  settings['SWIFT_VERSION'] = '5.0'
  settings['IPHONEOS_DEPLOYMENT_TARGET'] = '17.0'
  settings['TARGETED_DEVICE_FAMILY'] = '1'
  settings['INFOPLIST_FILE'] = 'App/LittleJoysWidgetExtension/Info.plist'
  settings['GENERATE_INFOPLIST_FILE'] = 'NO'
  settings['SKIP_INSTALL'] = 'YES'
  settings['CODE_SIGNING_ALLOWED'] = 'NO'
end
app.add_dependency(widget)
embed = project.new(Xcodeproj::Project::Object::PBXCopyFilesBuildPhase)
embed.name = 'Embed App Extensions'
embed.dst_subfolder_spec = '13'
embed.add_file_reference(widget.product_reference)
app.build_phases << embed
# Install native bridge in Capacitor's App target and register with a custom view controller.
bridge_dir = 'ios/App/App/JoyBridge'
FileUtils.mkdir_p(bridge_dir)
FileUtils.cp('NativeBridge/JoyBridgePlugin.swift', File.join(bridge_dir, 'JoyBridgePlugin.swift'))
File.write(File.join(bridge_dir, 'JoyViewController.swift'), <<~SWIFT)
  import UIKit
  import Capacitor
  class JoyViewController: CAPBridgeViewController {
      override open func capacitorDidLoad() {
          bridge?.registerPluginInstance(JoyBridgePlugin())
      }
  }
SWIFT
bridge_group = project.main_group.find_subpath('JoyBridge', true)
bridge_group.set_source_tree('SOURCE_ROOT')
bridge_group.set_path('App/JoyBridge')
%w[JoyBridgePlugin.swift JoyViewController.swift].each do |name|
  ref = bridge_group.new_file(name)
  app.source_build_phase.add_file_reference(ref)
end
# Capacitor's generated storyboard must instantiate our controller subclass.
storyboard = 'ios/App/App/Base.lproj/Main.storyboard'
if File.exist?(storyboard)
  xml = File.read(storyboard)
  xml = xml.gsub('customClass="CAPBridgeViewController"', 'customClass="JoyViewController" customModule="App" customModuleProvider="target"')
  File.write(storyboard, xml)
end
# App Groups: both targets need the same container identifier (device signing later).
entitlements_dir = 'ios/App/App'
app_ent = File.join(entitlements_dir, 'LittleJoys.entitlements')
widget_ent = File.join(extension_dir, 'LittleJoysWidget.entitlements')
app_groups = {'com.apple.security.application-groups' => ['group.com.littlejoys.app']}.to_plist
File.write(app_ent, app_groups)
File.write(widget_ent, app_groups)
app.build_configurations.each do |cfg|
  cfg.build_settings['CODE_SIGN_ENTITLEMENTS'] = 'App/LittleJoys.entitlements'
end
widget.build_configurations.each do |cfg|
  cfg.build_settings['CODE_SIGN_ENTITLEMENTS'] = 'App/LittleJoysWidgetExtension/LittleJoysWidget.entitlements'
end
project.save
puts 'Widget target added to generated Capacitor Xcode project.'
