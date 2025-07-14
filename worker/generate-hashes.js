import bcrypt from "bcryptjs";

const passwordSam = "sam-pass";
const passwordErin = "erin-pass";

const hashSam = bcrypt.hashSync(passwordSam, 10);
const hashErin = bcrypt.hashSync(passwordErin, 10);

console.log(`Hash for sam ('${passwordSam}'): ${hashSam}`);
console.log(`Hash for erin ('${passwordErin}'): ${hashErin}`);