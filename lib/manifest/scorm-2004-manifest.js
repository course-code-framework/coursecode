/**
 * @file scorm-2004-manifest.js
 * @description Generates imsmanifest.xml for SCORM 2004 4th Edition packages.
 */

/**
 * Generates the SCORM 2004 4th Edition manifest.
 * @param {Object} config - Course configuration
 * @param {string[]} files - List of files to include in the manifest
 * @returns {string} The manifest XML
 */
export function generateScorm2004Manifest(config, files) {
    const resourceFiles = files.filter(f =>
        f !== 'imsmanifest.xml' &&
        !f.endsWith('.xsd') &&
        !f.endsWith('.dtd') &&
        !f.startsWith('common/')
    );

    const fileEntries = resourceFiles.map(f => `      <file href="${f}"/>`).join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<!-- SCORM 2004 4th Edition manifest - GENERATED FILE - DO NOT EDIT MANUALLY -->
<manifest identifier="${config.title.replace(/[^a-zA-Z0-9]/g, '-')}"
            version="${config.version}"
            xmlns="http://www.imsglobal.org/xsd/imscp_v1p1"
            xmlns:imscp="http://www.imsglobal.org/xsd/imscp_v1p1"
            xmlns:imsss="http://www.imsglobal.org/xsd/imsss"
            xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_v1p3"
            xmlns:adlseq="http://www.adlnet.org/xsd/adlseq_v1p3"
            xmlns:adlnav="http://www.adlnet.org/xsd/adlnav_v1p3"
            xmlns:lom="http://ltsc.ieee.org/xsd/LOM"
            xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
            xsi:schemaLocation="
              http://www.imsglobal.org/xsd/imscp_v1p1 imscp_v1p1.xsd
              http://www.imsglobal.org/xsd/imsss imsss_v1p0.xsd
              http://www.adlnet.org/xsd/adlcp_v1p3 adlcp_v1p3.xsd
              http://www.adlnet.org/xsd/adlseq_v1p3 adlseq_v1p3.xsd
              http://www.adlnet.org/xsd/adlnav_v1p3 adlnav_v1p3.xsd
              http://ltsc.ieee.org/xsd/LOM lom.xsd"
            xml:base="./">

  <metadata>
    <schema>ADL SCORM</schema>
    <schemaversion>2004 4th Edition</schemaversion>
    <lom:lom>
      <lom:general>
        <lom:title><lom:string language="${config.language}">${config.title}</lom:string></lom:title>
        <lom:description><lom:string language="${config.language}">${config.description}</lom:string></lom:description>
        <lom:language>${config.language}</lom:language>
      </lom:general>
      <lom:lifecycle>
        <lom:version><lom:string>${config.version}</lom:string></lom:version>
        <lom:contribute>
          <lom:role>
            <lom:source><lom:string>LOMv1.0</lom:string></lom:source>
            <lom:value><lom:string>author</lom:string></lom:value>
          </lom:role>
          <lom:entity>${config.author}</lom:entity>
        </lom:contribute>
      </lom:lifecycle>
      <lom:technical>
        <lom:format>text/html</lom:format>
      </lom:technical>
    </lom:lom>
  </metadata>

  <organizations default="org-1">
    <organization identifier="org-1" adlseq:objectivesGlobalToSystem="false">
      <title>${config.title}</title>
      <item identifier="item-1" identifierref="res-1" isvisible="true">
        <title>${config.title}</title>
        <imsss:sequencing>
          <imsss:controlMode choiceExit="true" forwardOnly="false"/>
          <imsss:deliveryControls tracked="true" completionSetByContent="true" objectiveSetByContent="true"/>
          <adlnav:presentation>
            <adlnav:navigationInterface>
              <adlnav:hideLMSUI>continue</adlnav:hideLMSUI>
              <adlnav:hideLMSUI>previous</adlnav:hideLMSUI>
            </adlnav:navigationInterface>
          </adlnav:presentation>
        </imsss:sequencing>
      </item>
    </organization>
  </organizations>

  <resources>
    <resource identifier="res-1" type="webcontent" adlcp:scormType="sco" href="index.html">
${fileEntries}
    </resource>
  </resources>
</manifest>
`;
}
