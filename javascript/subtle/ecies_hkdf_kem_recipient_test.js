// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//
////////////////////////////////////////////////////////////////////////////////

goog.module('tink.subtle.EciesHkdfKemRecipientTest');
goog.setTestOnly('tink.subtle.EciesHkdfKemRecipientTest');

const Bytes = goog.require('tink.subtle.Bytes');
const EciesHkdfKemRecipient = goog.require('tink.subtle.EciesHkdfKemRecipient');
const EciesHkdfKemSender = goog.require('tink.subtle.EciesHkdfKemSender');
const EllipticCurves = goog.require('tink.subtle.EllipticCurves');
const Random = goog.require('tink.subtle.Random');
const TestCase = goog.require('goog.testing.TestCase');
const testSuite = goog.require('goog.testing.testSuite');
const userAgent = goog.require('goog.userAgent');


testSuite({
  shouldRunTests() {
    // https://msdn.microsoft.com/en-us/library/mt801195(v=vs.85).aspx
    return !userAgent.EDGE;  // b/120286783
  },

  setUp() {
    // Use a generous promise timeout for running continuously.
    TestCase.getActiveTestCase().promiseTimeout = 1000 * 1000;  // 1000s
  },

  tearDown() {
    // Reset the promise timeout to default value.
    TestCase.getActiveTestCase().promiseTimeout = 1000;  // 1s
  },

  async testEncapDecap() {
    const keyPair = await EllipticCurves.generateKeyPair('ECDH', 'P-256');
    const publicKey = await EllipticCurves.exportCryptoKey(keyPair.publicKey);
    const privateKey = await EllipticCurves.exportCryptoKey(keyPair.privateKey);
    const sender = await EciesHkdfKemSender.newInstance(publicKey);
    const recipient = await EciesHkdfKemRecipient.newInstance(privateKey);
    for (let i = 1; i < 20; i++) {
      const keySizeInBytes = i;
      const pointFormat = EllipticCurves.PointFormatType.UNCOMPRESSED;
      const hkdfHash = 'SHA-256';
      const hkdfInfo = Random.randBytes(i);
      const hkdfSalt = Random.randBytes(i);

      const kemKeyToken = await sender.encapsulate(
          keySizeInBytes, pointFormat, hkdfHash, hkdfInfo, hkdfSalt);
      const key = await recipient.decapsulate(
          kemKeyToken['token'], keySizeInBytes, pointFormat, hkdfHash, hkdfInfo,
          hkdfSalt);

      assertEquals(keySizeInBytes, kemKeyToken['key'].length);
      assertEquals(Bytes.toHex(key), Bytes.toHex(kemKeyToken['key']));
    }
  },

  async testDecap_nonIntegerKeySize() {
    const keyPair = await EllipticCurves.generateKeyPair('ECDH', 'P-256');
    const publicKey = await EllipticCurves.exportCryptoKey(keyPair.publicKey);
    const privateKey = await EllipticCurves.exportCryptoKey(keyPair.privateKey);
    const sender = await EciesHkdfKemSender.newInstance(publicKey);
    const recipient = await EciesHkdfKemRecipient.newInstance(privateKey);
    const keySizeInBytes = 16;
    const pointFormat = EllipticCurves.PointFormatType.UNCOMPRESSED;
    const hkdfHash = 'SHA-256';
    const hkdfInfo = Random.randBytes(16);
    const hkdfSalt = Random.randBytes(16);
    const kemKeyToken = await sender.encapsulate(
        keySizeInBytes, pointFormat, hkdfHash, hkdfInfo, hkdfSalt);

    try {
      await recipient.decapsulate(
          kemKeyToken['token'], NaN, pointFormat, hkdfHash, hkdfInfo, hkdfSalt);
      fail('An exception should be thrown.');
    } catch (e) {
      assertEquals('CustomError: size must be an integer', e.toString());
    }

    try {
      await recipient.decapsulate(
          kemKeyToken['token'], 1.8, pointFormat, hkdfHash, hkdfInfo, hkdfSalt);
      fail('An exception should be thrown.');
    } catch (e) {
      assertEquals('CustomError: size must be an integer', e.toString());
    }
  },


  async testNewInstance_invalidParameters() {
    // Test newInstance with public key instead private key.
    const keyPair = await EllipticCurves.generateKeyPair('ECDH', 'P-256');
    const publicKey = await EllipticCurves.exportCryptoKey(keyPair.publicKey);
    try {
      await EciesHkdfKemRecipient.newInstance(publicKey);
      fail('An exception should be thrown.');
    } catch (e) {
    }
  },

  async testNewInstance_invalidPrivateKey() {
    for (let testVector of TEST_VECTORS) {
      const ellipticCurveString = EllipticCurves.curveToString(testVector.crv);
      const privateJwk = EllipticCurves.pointDecode(
          ellipticCurveString, testVector.pointFormat,
          Bytes.fromHex(testVector.privateKeyPoint));
      privateJwk['d'] = Bytes.toBase64(
          Bytes.fromHex(testVector.privateKeyValue), /* opt_webSafe = */ true);

      // Change the x value such that the key si no more valid. Recipient should
      // either throw an exception or ignore the x value and compute the same
      // output value.
      const xLength = EllipticCurves.fieldSizeInBytes(testVector.crv);
      privateJwk['x'] =
          Bytes.toBase64(new Uint8Array(xLength), /* opt_webSafe = */ true);
      let output;
      try {
        const recipient = await EciesHkdfKemRecipient.newInstance(privateJwk);
        const hkdfInfo = Bytes.fromHex(testVector.hkdfInfo);
        const salt = Bytes.fromHex(testVector.salt);
        output = await recipient.decapsulate(
            Bytes.fromHex(testVector.token), testVector.outputLength,
            testVector.pointFormat, testVector.hashType, hkdfInfo, salt);
      } catch (e) {
        // Everything works properly if exception was thrown.
        return;
      }
      // If there was no exception, the output should be still correct (x value
      // should be ignored during the computation).
      assertEquals(testVector.expectedOutput, Bytes.toHex(output));
    }
  },

  async testConstructor_invalidParameters() {
    // Test public key instead of private key.
    const keyPair = await EllipticCurves.generateKeyPair('ECDH', 'P-256');
    try {
      new EciesHkdfKemRecipient(keyPair.publicKey);
      fail('An exception should be thrown.');
    } catch (e) {
      assertEquals(
          'CustomError: Expected crypto key of type: private.', e.toString());
    }
  },

  async testEncapDecap_differentParams() {
    const curveTypes = Object.keys(EllipticCurves.CurveType);
    const hashTypes = ['SHA-1', 'SHA-256', 'SHA-512'];
    for (let curve of curveTypes) {
      const curveString =
          EllipticCurves.curveToString(EllipticCurves.CurveType[curve]);
      for (let hashType of hashTypes) {
        const keyPair =
            await EllipticCurves.generateKeyPair('ECDH', curveString);
        const keySizeInBytes = 32;
        const pointFormat = EllipticCurves.PointFormatType.UNCOMPRESSED;
        const hkdfInfo = Random.randBytes(8);
        const hkdfSalt = Random.randBytes(16);

        const publicKey =
            await EllipticCurves.exportCryptoKey(keyPair.publicKey);
        const sender = await EciesHkdfKemSender.newInstance(publicKey);
        const kemKeyToken = await sender.encapsulate(
            keySizeInBytes, pointFormat, hashType, hkdfInfo, hkdfSalt);

        const privateKey =
            await EllipticCurves.exportCryptoKey(keyPair.privateKey);
        const recipient = await EciesHkdfKemRecipient.newInstance(privateKey);
        const key = await recipient.decapsulate(
            kemKeyToken['token'], keySizeInBytes, pointFormat, hashType,
            hkdfInfo, hkdfSalt);

        assertEquals(keySizeInBytes, kemKeyToken['key'].length);
        assertEquals(Bytes.toHex(key), Bytes.toHex(kemKeyToken['key']));
      }
    }
  },

  async testEncapDecap_modifiedToken() {
    const curveTypes = Object.keys(EllipticCurves.CurveType);
    const hashTypes = ['SHA-1', 'SHA-256', 'SHA-512'];
    for (let crvId of curveTypes) {
      const curve = EllipticCurves.CurveType[crvId];
      const curveString = EllipticCurves.curveToString(curve);
      for (let hashType of hashTypes) {
        const keyPair =
            await EllipticCurves.generateKeyPair('ECDH', curveString);
        const privateKey =
            await EllipticCurves.exportCryptoKey(keyPair.privateKey);
        const recipient = await EciesHkdfKemRecipient.newInstance(privateKey);
        const keySizeInBytes = 32;
        const pointFormat = EllipticCurves.PointFormatType.UNCOMPRESSED;
        const hkdfInfo = Random.randBytes(8);
        const hkdfSalt = Random.randBytes(16);

        // Create invalid token (EC point), while preserving the 0x04 prefix
        // byte.
        const token = Random.randBytes(
            EllipticCurves.encodingSizeInBytes(curve, pointFormat));
        token[0] = 0x04;
        try {
          await recipient.decapsulate(
              token, keySizeInBytes, pointFormat, hashType, hkdfInfo, hkdfSalt);
          fail('Should throw an exception');
        } catch (e) {
        }
      }
    }
  },

  async testDecapsulate_testVectorsGeneratedByJava() {
    for (let testVector of TEST_VECTORS) {
      const ellipticCurveString = EllipticCurves.curveToString(testVector.crv);
      const privateJwk = EllipticCurves.pointDecode(
          ellipticCurveString, testVector.pointFormat,
          Bytes.fromHex(testVector.privateKeyPoint));
      privateJwk['d'] = Bytes.toBase64(
          Bytes.fromHex(testVector.privateKeyValue), /* opt_webSafe = */ true);
      const recipient = await EciesHkdfKemRecipient.newInstance(privateJwk);
      const hkdfInfo = Bytes.fromHex(testVector.hkdfInfo);
      const salt = Bytes.fromHex(testVector.salt);
      const output = await recipient.decapsulate(
          Bytes.fromHex(testVector.token), testVector.outputLength,
          testVector.pointFormat, testVector.hashType, hkdfInfo, salt);
      assertEquals(testVector.expectedOutput, Bytes.toHex(output));
    }
  },
});


class TestVector {
  /**
   * @param {!EllipticCurves.CurveType} crv
   * @param {string} hashType
   * @param {!EllipticCurves.PointFormatType} pointFormat
   * @param {string} token
   * @param {string} privateKeyPoint
   * @param {string} privateKeyValue
   * @param {string} salt
   * @param {string} hkdfInfo
   * @param {number} outputLength
   * @param {string} expectedOutput
   */
  constructor(
      crv, hashType, pointFormat, token, privateKeyPoint, privateKeyValue, salt,
      hkdfInfo, outputLength, expectedOutput) {
    /** @const {!EllipticCurves.CurveType} */
    this.crv = crv;
    /** @const {string} */
    this.hashType = hashType;
    /** @const {!EllipticCurves.PointFormatType} */
    this.pointFormat = pointFormat;
    /** @const {string} */
    this.token = token;
    /** @const {string} */
    this.privateKeyPoint = privateKeyPoint;
    /** @const {string} */
    this.privateKeyValue = privateKeyValue;
    /** @const {string} */
    this.salt = salt;
    /** @const {string} */
    this.hkdfInfo = hkdfInfo;
    /** @const {number} */
    this.outputLength = outputLength;
    /** @const {string} */
    this.expectedOutput = expectedOutput;
  }
}

// Test vectors generated by Java version of Tink.
//
// Token (i.e. sender public key) and privateKeyPoint values are in UNCOMPRESSED
// EcPoint encoding (i.e. it has prefix '04' followed by x and y values).
/** @type {!Array<!TestVector>} */
const TEST_VECTORS = [
  new TestVector(
      EllipticCurves.CurveType.P256, 'SHA-256',
      EllipticCurves.PointFormatType.UNCOMPRESSED,
      /* token = */ '04' +
          '5cdd8e426d11970a610f0e5f9b27f247a421c477b379f2ff3fd3bac50dfff9ff' +
          '7cada79ab1de9ce4aeaff45fcd2628d1b6d7ecac99d4c26409d4ab8a362c8e7a',
      /* privateKeyPoint = */ '04' +
          '4adf0fff84b995bb97af250128a3d779c86ba3cd7e5c0fa2c10895d0b995aaee' +
          'cdced57616ebb04c808f191c2bf3848c495dcfddcdd1bb73d8ea7a15c642af05',
      /* privateKeyValue = */
      'da73e10f7d81483daa63438b982c879706bcf8fef8c7c4d3071c3ef2367714f3',
      /* salt = */ 'abcdef',
      /* hkdfInfo = */ 'aaaaaaaaaaaaaaaa',
      /* outputLength = */ 32,
      /* expectedOutput = */
      'aeeee35a14967310798f037e2f126e2e326369115eb9e2d1a34d9c6761f60511'),
  new TestVector(
      EllipticCurves.CurveType.P384, 'SHA-1',
      EllipticCurves.PointFormatType.UNCOMPRESSED,
      /* token = */ '04' +
          '75bc8a2e6cf80ce2e0a1cd60ab3d68e4d357b58ff69f0de14b7ec13c58a79750496e07db3f933167148d80730b96f000' +
          '9389967de410535ca3e103e7ce73dae9525f934589a6cd1fca37e61411985788dcedc71b35ef63b7365e391f6e2a945f',
      /* privateKeyPoint = */ '04' +
          '5f81886c4202897355b1da79348d53abd9e9119a7de6f5f10dfe751f7ca9c807035c029bac59499337c4af185fe61728' +
          'f132bfb234365a9c61e1e56c11acca3bee6621961c7c38eb9dcbd39b332fd35006876dccdb206a7b2d43cf70589c3356',
      /* privateKeyValue = */
      '544b5f32731d6277fa71e756f0b2d6840f62e6b744a8b8cdf91f8cf29e6d8562f6237369721f756ab044711e0d42c53c',
      /* salt = */ 'ababcdcd',
      /* hkdfInfo = */ '100000000000000001',
      /* outputLength = */ 32,
      /* expectedOutput = */
      '7a25c525eabaa0d994c27f7661a208b5ea25c2a778198237de6e4f235cd64a33'),
  new TestVector(
      EllipticCurves.CurveType.P521, 'SHA-512',
      EllipticCurves.PointFormatType.UNCOMPRESSED,
      /* token = */ '04' +
          '0075192f8decddf7a0371b2c859aad738cc5424fa70e74b560070ed8309ae8a6064b06f9aaad8020ac8620e62a6c1196efa44180d325a36a54945743b9382bd49bc1' +
          '000dfa1e30b228e975998b7afeaaf30235ec505960e58bf3269b69fffcbce9f15fc1441fab2ed97f554ae4bde8b956efb2372c5b330cb1aa0ab81b99e792acd7f5a8',
      /* privateKeyPoint = */ '04' +
          '00e57037a96bcbca532ef2f75646d825304ea716bbc9c4bf953455074347158f4818122c76e26a4cf94b39f451b7f5960b9cda43d49999ddc401c1be7f082052b387' +
          '0147197ba83ec55c8b02e6cbe7b49ce6d6c238edb89561bde6b4574a585c684379d8040888117866823258216344a7268dc696c3a2d192824a1e693609b44661fc2c',
      /* privateKeyValue = */
      '001e5410117d22e95c5768b82a786dd66fa8c326b938a3a81fdd6113499437ae9f74e9f876adf085c187c6a147abc13460b8ed3050a6b228005426b61f2b616a79c6',
      /* salt = */ '00001111',
      /* hkdfInfo = */ '1234123412341234',
      /* outputLength = */ 32,
      /* expectedOutput = */
      '3f7f64c7aba2cb012c9b5a952385290604b3b5843ec6e6714647a9c9d6ac87be')
];
