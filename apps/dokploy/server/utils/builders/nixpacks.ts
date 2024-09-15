import type { WriteStream } from "node:fs";
import path from "node:path";
import { buildStatic } from "@/server/utils/builders/static";
import { nanoid } from "nanoid";
import type { ApplicationNested } from ".";
import { prepareEnvironmentVariables } from "../docker/utils";
import { getBuildAppDirectory } from "../filesystem/directory";
import { spawnAsync } from "../process/spawnAsync";
import { executeCommand } from "../servers/command";

export const buildNixpacks = async (
	application: ApplicationNested,
	writeStream: WriteStream,
) => {
	const { env, appName, publishDirectory, serverId } = application;

	const buildAppDirectory = getBuildAppDirectory(application);
	const buildContainerId = `${appName}-${nanoid(10)}`;
	const envVariables = prepareEnvironmentVariables(env);

	const writeToStream = (data: string) => {
		if (writeStream.writable) {
			writeStream.write(data);
		}
	};

	try {
		const args = ["build", buildAppDirectory, "--name", appName];

		for (const env of envVariables) {
			args.push("--env", env);
		}

		if (publishDirectory) {
			/* No need for any start command, since we'll use nginx later on */
			args.push("--no-error-without-start");
		}

		await spawnAsync("nixpacks", args, writeToStream);

		/*
			Run the container with the image created by nixpacks,
			and copy the artifacts on the host filesystem.
			Then, remove the container and create a static build.
		*/

		if (publishDirectory) {
			await spawnAsync(
				"docker",
				["create", "--name", buildContainerId, appName],
				writeToStream,
			);

			await spawnAsync(
				"docker",
				[
					"cp",
					`${buildContainerId}:/app/${publishDirectory}`,
					path.join(buildAppDirectory, publishDirectory),
				],
				writeToStream,
			);

			await spawnAsync("docker", ["rm", buildContainerId], writeToStream);

			await buildStatic(application, writeStream);
		}
		return true;
	} catch (e) {
		await spawnAsync("docker", ["rm", buildContainerId], writeToStream);

		throw e;
	}
};

export const getNixpacksCommand = (
	application: ApplicationNested,
	logPath: string,
) => {
	const { env, appName, publishDirectory, serverId } = application;

	const buildAppDirectory = getBuildAppDirectory(application);
	const buildContainerId = `${appName}-${nanoid(10)}`;
	const envVariables = prepareEnvironmentVariables(env);

	try {
		const args = ["build", buildAppDirectory, "--name", appName];

		for (const env of envVariables) {
			args.push("--env", env);
		}

		if (publishDirectory) {
			/* No need for any start command, since we'll use nginx later on */
			args.push("--no-error-without-start");
		}
		console.log("args", args);
		const command = `nixpacks ${args.join(" ")}`;
		const bashCommand = `
echo "Starting nixpacks build..." >> ${logPath};
${command} >> ${logPath} 2>&1;
echo "Nixpacks build completed." >> ${logPath};
		`;

		/*
			 Run the container with the image created by nixpacks,
			 and copy the artifacts on the host filesystem.
			 Then, remove the container and create a static build.
		 */

		if (publishDirectory) {
		}

		// if (publishDirectory) {
		// 	bashCommand += `
		// 		 docker create --name ${buildContainerId} ${appName}
		// 		 docker cp ${buildContainerId}:/app/${publishDirectory} ${path.join(buildAppDirectory, publishDirectory)}
		// 		 docker rm ${buildContainerId}
		// 		 buildStatic ${application} ${writeStream}
		// 		 `;
		// }

		return bashCommand;
	} catch (e) {
		//  await spawnAsync("docker", ["rm", buildContainerId], writeToStream);

		throw e;
	}
};
