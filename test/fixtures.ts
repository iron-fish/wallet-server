import { LightBlock } from "@/models/lightstreamer";

// hex encoded light block, retrieved by
// Buffer.from(LightBlock.encode(response).finish()).toString('hex')
export const blockFixture: LightBlock = LightBlock.decode(
  Buffer.from(
    "08011089ae0a1a200000000000000024f4e8492f1653a7aa997c9b86fab392a1140303e45838ca9b2220000000000000009f950fac06bcae21db6706db68a4d66247bca2b587ad61320e28d8f9eed50f32f00212205c25c7ec7420d3edc9ff952e6ada447606ed944a5a4bd2e0fde080db6a23e7fe2acb020ac8020857ee984b513c15dbab7413943d9f34344d60a865968f0362796deff441014edb8cf3b61ef484c4a79bcecabe56683b142216567134d193cd7f389e17bb475546e8d13475ee44382f87b8eb5d8d9d819d78420b9d3d11c647b289116c41d707ce4f31d1c9f05daa56f876861cbfa7128a89a89538310971b485259fab82e8cfc315b3379e9d3f9ff73a69be91a406f29d9f76f75d80cf29696f8f2d4f0945c7847ca75bbdecef5dd7b2b6dc4b6a2324e4cfa6d81bf27179bb8e7418033bd6177e03a60ccc1f1dbf53cbb2d8c4e5391fca34a42d23dcbb387ec93323b102ae33dba991f6cb510874872269ba71111e664021829dac1ce86d49726f6e2046697368206e6f746520656e6372797074696f6e206d696e6572206b657930303030303030303030303030303030303030303030303030303030303030303030303030303030303030303032f4060801122038b6fadca175e6749233526b738086efc05c0edc89a5f7e7bd76bf38dcff093722221220f5891f6f40656a2c77ff660439346369896ce913d93e4c1f5680ff82ffb9ab8c2222122075e9a30f6a9bc2586ab670dd24bfc4869d90825798cd42a41c9c47a64b9e23c022221220c8efb542ddc1b26a5fead3a478d178ec0c674ec665efdf47ec1b183abfe26c9e22221220f9c8710db56c9a6466889b19ded422af5780c916a7552bb9cb0fc2c50557a16122221220c5cb032ba64efa2b0bf3abaaa850f78d525e02e47d8193dce04222c17776d2092acb020ac802f14d03e3e7fbe7c1678d3d9347ee0825792f9a55deb9023bfe5b1b5ea8f058ce50ea88469f4905b9122f311f20f9c36d6225314bfdeb4674e60cff97c91c352926062b6a7d65eca47b707f3e98e987bbb0e7624b6f21b250a6b92847f815aaa9929340258063e1a64a486b85e695b82b3d585d46224b42e277c75576e90f12e7e33bb62ae2cad57bbd3f6e1093ede0d39919d1497c6fbf665b8caaad228b4adee4ff43abcb2df6029d2b7031c62b5aadbf438625f17483a4c0125805f6e2d11e9a60782e0171bc497c3cb240ec7cfaaf31a1b3a6aa08d66b7cc4556cdd6a31d0b5bc86b9b2a606a07bd3131b7c832a3695be7409ffb19556fd0b1efdbba410a237ad6f236e4d71aecd3f7da7a5cf59894cebc5cd39519f5750a66e2167836efbca293e667a5d33da7cb64b5e6a85511803e31bc63f9ad18e69dece8c16576ef10e92739d7ce295072acb020ac8023dbe0db3bd09785a4716f1a81cd751bc847579629065e86a96b966074d151e8f29bdd40566c7adb1caf84c08cd62dcae04a1a80f2a0ccb8b7d73e545103f1c4ba720dadf259e82f165340b664221468ead7b58b4879b7b599ed96679e3cbdc86114532a1d5131760471f65e02bb32d216f08e9697d866e344a23983177c7880bce943187fb375d4b39453c531ef56752a4a8fbb57483969d28cec4e812891d5fb5adbfa71372d4b6301b85fbfd84288c78a689cdd1fa0c8f05f3d0ad5ae20fa7f3dfc014b948a63bef8aabc0a0f2ab16c2a3220a96914b106a33365bf62b681ba2fd1c2b8a18e81b044a41c44a838dffc0e7e8ced05d47c80d249afa5822fca4244f7eb9248c5ecb626d7ef9e1fad7561977d62dd744c46aa5a888f13556d41b48dd458718fa9c0a0aa5958d75a77f130a7749271ae4e6da2791ac7dd59e150ce3865c3d59ef4328",
    "hex",
  ),
);
