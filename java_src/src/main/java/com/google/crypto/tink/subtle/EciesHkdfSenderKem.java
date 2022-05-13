// Copyright 2017 Google Inc.
//
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

package com.google.crypto.tink.subtle;

import com.google.crypto.tink.internal.ByteArray;
import java.security.GeneralSecurityException;
import java.security.KeyPair;
import java.security.interfaces.ECPrivateKey;
import java.security.interfaces.ECPublicKey;

/**
 * HKDF-based ECIES-KEM (key encapsulation mechanism) for ECIES sender.
 *
 * @since 1.0.0
 */
public final class EciesHkdfSenderKem {
  private ECPublicKey recipientPublicKey;

  /** A container for key parts generated by the KEM. */
  public static final class KemKey {
    private final ByteArray kemBytes;
    private final ByteArray symmetricKey;

    public KemKey(final byte[] kemBytes, final byte[] symmetricKey) {
      this.kemBytes = ByteArray.of(kemBytes);
      this.symmetricKey = ByteArray.of(symmetricKey);
    }

    public byte[] getKemBytes() {
      if (kemBytes == null) {
        return null;
      } else {
        return kemBytes.getBytes();
      }
    }

    public byte[] getSymmetricKey() {
      if (symmetricKey == null) {
        return null;
      } else {
        return symmetricKey.getBytes();
      }
    }
  }

  public EciesHkdfSenderKem(final ECPublicKey recipientPublicKey) {
    this.recipientPublicKey = recipientPublicKey;
  }

  public KemKey generateKey(
      String hmacAlgo,
      final byte[] hkdfSalt,
      final byte[] hkdfInfo,
      int keySizeInBytes,
      EllipticCurves.PointFormatType pointFormat)
      throws GeneralSecurityException {
    KeyPair ephemeralKeyPair = EllipticCurves.generateKeyPair(recipientPublicKey.getParams());
    ECPublicKey ephemeralPublicKey = (ECPublicKey) ephemeralKeyPair.getPublic();
    ECPrivateKey ephemeralPrivateKey = (ECPrivateKey) ephemeralKeyPair.getPrivate();
    byte[] sharedSecret = EllipticCurves.computeSharedSecret(
        ephemeralPrivateKey, recipientPublicKey);
    byte[] kemBytes =
        EllipticCurves.pointEncode(
            ephemeralPublicKey.getParams().getCurve(), pointFormat, ephemeralPublicKey.getW());
    byte[] symmetricKey =
        Hkdf.computeEciesHkdfSymmetricKey(
            kemBytes, sharedSecret, hmacAlgo, hkdfSalt, hkdfInfo, keySizeInBytes);
    return new KemKey(kemBytes, symmetricKey);
  }
}
